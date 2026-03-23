'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatSession,
  SessionType,
  SessionStatus,
  ChatMessageMetadata,
  DirectorState,
} from '@/lib/types/chat';
import type { DiscussionRequest } from '@/components/roundtable';
import type { Action, SpotlightAction, DiscussionAction } from '@/lib/types/action';
import type { UIMessage } from 'ai';
import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { USER_AVATAR } from '@/lib/types/roundtable';
import { processSSEStream } from './process-sse-stream';
import { StreamBuffer } from '@/lib/buffer/stream-buffer';
import type { AgentStartItem, ActionItem } from '@/lib/buffer/stream-buffer';
import { ActionEngine } from '@/lib/action/engine';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';

const log = createLogger('ChatSessions');

interface UseChatSessionsOptions {
  onLiveSpeech?: (text: string | null, agentId?: string | null) => void;
  onSpeechProgress?: (ratio: number | null) => void;
  onThinking?: (state: { stage: string; agentId?: string } | null) => void;
  onCueUser?: (fromAgentId?: string, prompt?: string) => void;
  onActiveBubble?: (messageId: string | null) => void;
  /** 当问答/讨论会话自然完成（导演结束）时调用。 */
  onStopSession?: () => void;
}

export function useChatSessions(options: UseChatSessionsOptions = {}) {
  const onLiveSpeechRef = useRef(options.onLiveSpeech);
  const onSpeechProgressRef = useRef(options.onSpeechProgress);
  const onThinkingRef = useRef(options.onThinking);
  const onCueUserRef = useRef(options.onCueUser);
  const onActiveBubbleRef = useRef(options.onActiveBubble);
  const onStopSessionRef = useRef(options.onStopSession);
  useEffect(() => {
    onLiveSpeechRef.current = options.onLiveSpeech;
    onSpeechProgressRef.current = options.onSpeechProgress;
    onThinkingRef.current = options.onThinking;
    onCueUserRef.current = options.onCueUser;
    onActiveBubbleRef.current = options.onActiveBubble;
    onStopSessionRef.current = options.onStopSession;
  }, [
    options.onLiveSpeech,
    options.onSpeechProgress,
    options.onThinking,
    options.onCueUser,
    options.onActiveBubble,
    options.onStopSession,
  ]);
  const { t } = useI18n();

  // 追踪当前 stageId 以实现数据隔离
  const stageId = useStageStore((s) => s.stage?.id);
  const stageIdRef = useRef(stageId);

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    // 从 store 恢复会话（从 IndexedDB 加载）
    const stored = useStageStore.getState().chats;
    return stored.map((s) =>
      s.status === 'active' ? { ...s, status: 'interrupted' as SessionStatus } : s,
    );
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<ChatSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // 每次循环迭代的状态 —— 追踪智能体循环的 done 事件数据和 cue_user
  const loopDoneDataRef = useRef<{
    directorState?: DirectorState;
    totalAgents: number;
    agentHadContent?: boolean;
    cueUserReceived: boolean;
  } | null>(null);

  // 当 stage 变化时重新加载会话（课程切换）
  // 此同步 setState 是有意为之：当 stageId 依赖项变化时，
  // 从外部 store（IndexedDB）重置派生状态。
  useEffect(() => {
    if (stageId === stageIdRef.current) return;
    stageIdRef.current = stageId;
    // Stage 已变更 —— 从 store 重新加载会话（已由 loadFromStorage 填充）
    const stored = useStageStore.getState().chats;
    setSessions(
      stored.map((s) =>
        s.status === 'active' ? { ...s, status: 'interrupted' as SessionStatus } : s,
      ),
    );
    setActiveSessionId(null);
    setExpandedSessionIds(new Set());
  }, [stageId]);

  // 将会话同步回 store 以进行持久化（通过 store 的 debouncedSave 防抖）
  // 保护：仅写入当前活动的 stage
  useEffect(() => {
    if (stageIdRef.current && stageIdRef.current === useStageStore.getState().stage?.id) {
      useStageStore.getState().setChats(sessions);
    }
  }, [sessions]);

  // 每个会话的 StreamBuffer 实例（SSE + 课程共用相同的缓冲区模型）
  const buffersRef = useRef<Map<string, StreamBuffer>>(new Map());

  // 追踪每个课程会话的唯一消息 ID
  const lectureMessageIds = useRef<Map<string, string>>(new Map());

  // 追踪每个课程会话的最后动作索引（避免过时的闭包读取）
  const lectureLastActionIndexRef = useRef<Map<string, number>>(new Map());

  const toggleSessionExpand = useCallback((sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  /**
   * 为会话创建 StreamBuffer 并将其回调连接到 React 状态。
   * 返回 buffer 实例（同时也存储在 buffersRef 中）。
   */
  const createBufferForSession = useCallback(
    (sessionId: string, type?: SessionType): StreamBuffer => {
      // 如果存在之前的缓冲区则销毁
      // 关闭（非销毁）—— 避免过时的 onLiveSpeech(null,null) 回调
      const prev = buffersRef.current.get(sessionId);
      if (prev) prev.shutdown();

      // 对于讨论/问答会话，添加节奏延迟，防止快速模型
      // 过快处理文本和动作。课程的节奏由 PlaybackEngine 处理。
      const pacingOptions = type === 'lecture' ? {} : { postTextDelayMs: 1200, actionDelayMs: 800 };

      const buffer = new StreamBuffer(
        {
          onAgentStart(data: AgentStartItem) {
            const now = Date.now();
            const agentConfig = useAgentRegistry.getState().getAgent(data.agentId);
            const newMsg: UIMessage<ChatMessageMetadata> = {
              id: data.messageId,
              role: 'assistant',
              parts: [],
              metadata: {
                senderName: agentConfig?.name || data.agentName,
                senderAvatar: data.avatar || agentConfig?.avatar,
                originalRole: 'agent',
                agentId: data.agentId,
                createdAt: now,
              },
            };
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? { ...s, messages: [...s.messages, newMsg], updatedAt: now }
                  : s,
              ),
            );
            onActiveBubbleRef.current?.(data.messageId);
          },

          onAgentEnd() {
            // 移除空的助手消息（智能体已启动但未产生内容）
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                const msgs = s.messages.filter(
                  (m) => !(m.role === 'assistant' && m.parts.length === 0),
                );
                return msgs.length !== s.messages.length ? { ...s, messages: msgs } : s;
              }),
            );
          },

          onTextReveal(
            messageId: string,
            partId: string,
            revealedText: string,
            _isComplete: boolean,
          ) {
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) => {
                    if (m.id !== messageId) return m;
                    const parts = [...m.parts];
                    // 通过 _partId 匹配（支持每条消息多个文本部分，例如课程）
                    const existingIdx = parts.findIndex(
                      (p) => (p as unknown as Record<string, unknown>)._partId === partId,
                    );
                    if (existingIdx >= 0) {
                      parts[existingIdx] = {
                        type: 'text',
                        text: revealedText,
                        _partId: partId,
                      } as UIMessage<ChatMessageMetadata>['parts'][number];
                    } else {
                      parts.push({
                        type: 'text',
                        text: revealedText,
                        _partId: partId,
                      } as UIMessage<ChatMessageMetadata>['parts'][number]);
                    }
                    return { ...m, parts };
                  }),
                  // 不要在每次 tick 时更新 updatedAt —— 避免频繁触发持久化同步
                };
              }),
            );
          },

          onActionReady(messageId: string, data: ActionItem) {
            // 将动作标签添加到消息部分
            const actionPart = {
              type: `action-${data.actionName}`,
              actionId: data.actionId,
              actionName: data.actionName,
              input: data.params,
              state: 'result',
              output: { success: true },
            } as unknown as UIMessage<ChatMessageMetadata>['parts'][number];

            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId ? { ...m, parts: [...m.parts, actionPart] } : m,
                  ),
                  updatedAt: Date.now(),
                };
              }),
            );

            // 通过 ActionEngine 执行动作（视觉效果采用即发即弃模式）
            try {
              const actionEngine = new ActionEngine(useStageStore);
              const action = {
                id: data.actionId,
                type: data.actionName,
                ...data.params,
              } as Action;
              actionEngine.execute(action);
            } catch (err) {
              log.warn('[Buffer] Action execution error:', err);
            }
          },

          onLiveSpeech(text: string | null, agentId: string | null) {
            // 课程会话：圆桌文本由 PlaybackEngine → setLectureSpeech 管理
            // 在 stage.tsx 中。缓冲区仅驱动课程聊天区域的节奏。
            if (type === 'lecture') return;
            onLiveSpeechRef.current?.(text, agentId);
          },

          onSpeechProgress(ratio: number | null) {
            onSpeechProgressRef.current?.(ratio);
          },

          onThinking(data: { stage: string; agentId?: string } | null) {
            onThinkingRef.current?.(data);
          },

          onCueUser(fromAgentId?: string, prompt?: string) {
            // 追踪智能体循环的 cue_user
            if (loopDoneDataRef.current) {
              loopDoneDataRef.current.cueUserReceived = true;
            } else {
              loopDoneDataRef.current = {
                totalAgents: 0,
                cueUserReceived: true,
              };
            }
            onCueUserRef.current?.(fromAgentId, prompt);
          },

          onDone(data: {
            totalActions: number;
            totalAgents: number;
            agentHadContent?: boolean;
            directorState?: DirectorState;
          }) {
            // 存储 done 数据供智能体循环使用
            loopDoneDataRef.current = {
              directorState: data.directorState,
              totalAgents: data.totalAgents,
              agentHadContent: data.agentHadContent ?? true,
              cueUserReceived: loopDoneDataRef.current?.cueUserReceived ?? false,
            };
            // 会话完成由 runAgentLoop 处理，而非此处
            // （课程不使用智能体循环，通过 endSession 完成）
          },

          onError(message: string) {
            log.error('[Buffer] Stream error:', message);
          },
        },
        pacingOptions,
      );

      buffersRef.current.set(sessionId, buffer);
      buffer.start();
      return buffer;
    },
    [],
  );

  /**
   * 前端驱动的智能体循环。逐个智能体发送请求，直到：
   * - 导演返回 END（无智能体发言，无 cue_user）
   * - 导演返回 USER（收到 cue_user 事件）
   * - 达到 maxTurns
   * - 请求被中止
   *
   * 每次迭代：POST /api/chat → 处理 SSE → 等待缓冲区排空 → 检查结果。
   */
  const runAgentLoop = useCallback(
    async (
      sessionId: string,
      requestTemplate: {
        messages: UIMessage<ChatMessageMetadata>[];
        storeState: Record<string, unknown>;
        config: {
          agentIds: string[];
          sessionType?: string;
          agentConfigs?: Record<string, unknown>[];
          [key: string]: unknown;
        };
        userProfile?: { nickname?: string; bio?: string };
        apiKey: string;
        baseUrl?: string;
        model?: string;
      },
      controller: AbortController,
      sessionType: SessionType,
    ): Promise<void> => {
      const settingsState = useSettingsStore.getState();

      // 为生成的（非默认）智能体附加完整配置，以便服务器使用。
      // 服务器端注册表仅有默认智能体；生成的智能体仅存在于客户端。
      const generatedConfigs = requestTemplate.config.agentIds
        .filter((id: string) => !id.startsWith('default-'))
        .map((id: string) => useAgentRegistry.getState().getAgent(id))
        .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
        .map(({ createdAt: _c, updatedAt: _u, isDefault: _d, ...rest }) => rest);
      if (generatedConfigs.length > 0) {
        requestTemplate.config.agentConfigs = generatedConfigs;
      }

      const defaultMaxTurns = requestTemplate.config.agentIds.length <= 1 ? 1 : 10;
      const maxTurns = settingsState.maxTurns
        ? parseInt(settingsState.maxTurns, 10) || defaultMaxTurns
        : defaultMaxTurns;

      let directorState: DirectorState | undefined = undefined;
      let turnCount = 0;
      let currentMessages = requestTemplate.messages;
      let consecutiveEmptyTurns = 0;

      while (turnCount < maxTurns) {
        if (controller.signal.aborted) break;

        // 重置本次迭代的循环状态
        loopDoneDataRef.current = null;

        // 每次迭代刷新 store 状态 —— 智能体动作可能在轮次之间
        // 改变了白板、场景或模式
        const freshState = useStageStore.getState();
        const freshStoreState = {
          stage: freshState.stage,
          scenes: freshState.scenes,
          currentSceneId: freshState.currentSceneId,
          mode: freshState.mode,
          whiteboardOpen: useCanvasStore.getState().whiteboardOpen,
        };

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestTemplate,
            messages: currentMessages,
            storeState: freshStoreState,
            directorState,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const buffer = createBufferForSession(sessionId, sessionType);
        await processSSEStream(response, sessionId, buffer, controller.signal);

        // 等待缓冲区完成所有项目的播放（字符动画、延迟）
        try {
          await buffer.waitUntilDrained();
        } catch {
          // 缓冲区已被销毁/关闭（中止或会话结束）—— 退出循环
          break;
        }

        if (controller.signal.aborted) break;

        // 从 done 数据读取循环结果。
        // loopDoneDataRef 由 StreamBuffer 回调（onDone, onCueUser）修改；
        // TypeScript 的 CFA 无法追踪跨回调的修改。
        const doneData = loopDoneDataRef.current as {
          directorState?: DirectorState;
          totalAgents: number;
          agentHadContent?: boolean;
          cueUserReceived: boolean;
        } | null;
        if (!doneData) break; // 无 done 事件 —— 出现问题

        // 更新累积的导演状态
        directorState = doneData.directorState;
        turnCount = directorState?.turnCount ?? turnCount + 1;

        // 检查结果
        if (doneData.cueUserReceived) {
          // 导演说 USER —— 停止循环，等待用户输入
          break;
        }
        if (doneData.totalAgents === 0) {
          // 导演说 END —— 无智能体发言，对话完成
          break;
        }

        // 追踪连续的空响应（智能体已调度但未产生内容）
        if (doneData.agentHadContent === false) {
          consecutiveEmptyTurns++;
          if (consecutiveEmptyTurns >= 2) {
            log.warn(
              `[AgentLoop] ${consecutiveEmptyTurns} consecutive empty agent responses, stopping loop`,
            );
            break;
          }
        } else {
          consecutiveEmptyTurns = 0;
        }

        // 智能体已发言 —— 如果未达到 maxTurns 则继续循环
        // 从最新的会话状态刷新消息以进行下一次迭代
        const currentSession = sessionsRef.current.find((s) => s.id === sessionId);
        if (currentSession) {
          currentMessages = currentSession.messages;
        }
      }

      // 处理循环完成
      const doneData = loopDoneDataRef.current;
      if (!controller.signal.aborted) {
        const wasCueUser = doneData?.cueUserReceived ?? false;
        if (!wasCueUser) {
          // 会话正常完成（END 或达到 maxTurns）
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    status: 'completed' as SessionStatus,
                    updatedAt: Date.now(),
                  }
                : s,
            ),
          );
          onStopSessionRef.current?.();
        }
        // 如果达到 maxTurns，记录日志
        if (turnCount >= maxTurns && doneData && doneData.totalAgents > 0) {
          log.info(`[AgentLoop] Max turns (${maxTurns}) reached for session ${sessionId}`);
        }
      }
    },
    [createBufferForSession],
  );

  /**
   * 创建新的聊天会话
   */
  const createSession = useCallback(async (type: SessionType, title: string): Promise<string> => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();

    const newSession: ChatSession = {
      id: sessionId,
      type,
      title,
      status: 'active',
      messages: [],
      config: {
        agentIds: ['default-1'],
        maxTurns: 0, // 运行时未使用 —— 前端循环管理 maxTurns
        currentTurn: 0,
        defaultAgentId: 'default-1',
      },
      toolCalls: [],
      pendingToolCalls: [],
      createdAt: now,
      updatedAt: now,
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(sessionId);
    setExpandedSessionIds((prev) => new Set([...prev, sessionId]));

    log.info(`[ChatArea] Created session: ${sessionId} (${type})`);
    return sessionId;
  }, []);

  /**
   * 结束聊天会话。
   * 对于有活动流的问答/讨论会话，追加 "..." + 中断标记。
   */
  const endSession = useCallback(
    async (sessionId: string): Promise<void> => {
      log.info(`[ChatArea] Ending session: ${sessionId}`);

      const session = sessionsRef.current.find((s) => s.id === sessionId);
      const isLiveSession = session && (session.type === 'qa' || session.type === 'discussion');
      const wasStreaming = !!(
        abortControllerRef.current && streamingSessionIdRef.current === sessionId
      );

      // 仅当此会话拥有活动流时才中止
      if (wasStreaming) {
        abortControllerRef.current!.abort();
        abortControllerRef.current = null;
        streamingSessionIdRef.current = null;
        setIsStreaming(false);
      }

      // 销毁缓冲区 —— 关闭避免触发过时的 onLiveSpeech(null,null)
      const buf = buffersRef.current.get(sessionId);
      if (buf) {
        buf.shutdown();
        buffersRef.current.delete(sessionId);
      }
      lectureMessageIds.current.delete(sessionId);
      lectureLastActionIndexRef.current.delete(sessionId);

      if (isLiveSession && wasStreaming) {
        // 在最后的助手消息后追加 "..." + 中断标记
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            const messages = [...s.messages];
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'assistant') {
                const parts = [...messages[i].parts];
                let appended = false;
                for (let j = parts.length - 1; j >= 0; j--) {
                  if (parts[j].type === 'text') {
                    const textPart = parts[j] as { type: 'text'; text: string };
                    parts[j] = {
                      type: 'text',
                      text: (textPart.text || '') + '...',
                    } as UIMessage<ChatMessageMetadata>['parts'][number];
                    appended = true;
                    break;
                  }
                }
                if (!appended) {
                  parts.push({
                    type: 'text',
                    text: '...',
                  } as UIMessage<ChatMessageMetadata>['parts'][number]);
                }
                messages[i] = {
                  ...messages[i],
                  parts,
                  metadata: { ...messages[i].metadata, interrupted: true },
                };
                break;
              }
            }
            return { ...s, messages, status: 'completed' as SessionStatus };
          }),
        );
        // 通过回调清除圆桌状态
        onLiveSpeechRef.current?.(null, null);
        onThinkingRef.current?.(null);
      } else {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, status: 'completed' as SessionStatus } : s,
          ),
        );
      }

      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    },
    [activeSessionId],
  );

  /**
   * 结束当前活动的问答/讨论会话（如果有）。
   */
  const endActiveSession = useCallback(async (): Promise<void> => {
    const active = sessionsRef.current.find(
      (s) => (s.type === 'qa' || s.type === 'discussion') && s.status === 'active',
    );
    if (active) {
      await endSession(active.id);
    }
  }, [endSession]);

  /**
   * 软暂停活动的问答/讨论会话。
   * 中止 SSE 并追加 "..." + 中断标记，但保持会话 'active'
   * 以便用户可以在同一话题中继续发言。
   */
  const softPauseSession = useCallback(async (sessionId: string): Promise<void> => {
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (!session) return;
    const isLiveSession = session.type === 'qa' || session.type === 'discussion';
    if (!isLiveSession || session.status !== 'active') return;

    const wasStreaming = !!(
      abortControllerRef.current && streamingSessionIdRef.current === sessionId
    );

    // 销毁缓冲区 —— 不再有 tick，不再有过时的 onDone/onLiveSpeech 回调。
    // 恢复时将创建新的缓冲区。
    const buf = buffersRef.current.get(sessionId);
    if (buf) {
      buf.shutdown();
      buffersRef.current.delete(sessionId);
    }

    // 中止 SSE 流
    if (wasStreaming) {
      abortControllerRef.current!.abort();
      abortControllerRef.current = null;
      streamingSessionIdRef.current = null;
      setIsStreaming(false);
    }

    if (wasStreaming) {
      // 在最后的助手消息后追加 "..." + 中断标记，保持状态为 'active'
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const messages = [...s.messages];
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
              const parts = [...messages[i].parts];
              let appended = false;
              for (let j = parts.length - 1; j >= 0; j--) {
                if (parts[j].type === 'text') {
                  const textPart = parts[j] as { type: 'text'; text: string };
                  parts[j] = {
                    type: 'text',
                    text: (textPart.text || '') + '...',
                  } as UIMessage<ChatMessageMetadata>['parts'][number];
                  appended = true;
                  break;
                }
              }
              if (!appended) {
                parts.push({
                  type: 'text',
                  text: '...',
                } as UIMessage<ChatMessageMetadata>['parts'][number]);
              }
              messages[i] = {
                ...messages[i],
                parts,
                metadata: { ...messages[i].metadata, interrupted: true },
              };
              break;
            }
          }
          // 保持状态为 'active' —— 用户发言时会话继续
          return { ...s, messages, updatedAt: Date.now() };
        }),
      );
      // 注意：此处不要调用 onLiveSpeech/onThinking。
      // 调用者（doSoftPause）管理圆桌状态以保持中断的气泡可见。
    }

    log.info(`[ChatArea] Soft-paused session: ${sessionId}`);
  }, []);

  /**
   * 软暂停当前活动的问答/讨论会话（如果有）。
   */
  const softPauseActiveSession = useCallback(async (): Promise<void> => {
    const active = sessionsRef.current.find(
      (s) => (s.type === 'qa' || s.type === 'discussion') && s.status === 'active',
    );
    if (active) {
      await softPauseSession(active.id);
    }
  }, [softPauseSession]);

  /**
   * 通过使用现有消息重新调用 /chat 来恢复软暂停的会话。
   * 导演将选择下一个智能体继续话题。
   */
  const resumeSession = useCallback(
    async (sessionId: string): Promise<void> => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session || session.status !== 'active') return;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      streamingSessionIdRef.current = sessionId;
      setIsStreaming(true);

      const currentState = useStageStore.getState();

      try {
        log.info(`[ChatArea] Resuming session: ${sessionId}`);

        const userProfileState = useUserProfileStore.getState();
        const mc = getCurrentModelConfig();

        const agentIds =
          useSettingsStore.getState().selectedAgentIds?.length > 0
            ? useSettingsStore.getState().selectedAgentIds
            : session.config.agentIds;

        await runAgentLoop(
          sessionId,
          {
            messages: session.messages,
            storeState: {
              stage: currentState.stage,
              scenes: currentState.scenes,
              currentSceneId: currentState.currentSceneId,
              mode: currentState.mode,
              whiteboardOpen: useCanvasStore.getState().whiteboardOpen,
            },
            config: {
              agentIds,
              sessionType: session.type,
            },
            userProfile: {
              nickname: userProfileState.nickname || undefined,
              bio: userProfileState.bio || undefined,
            },
            apiKey: mc.apiKey,
            baseUrl: mc.baseUrl,
            model: mc.modelString,
          },
          controller,
          session.type,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          log.info('[ChatArea] Resume aborted');
          return;
        }
        log.error('[ChatArea] Resume error:', error);

        const errorMessageId = `error-${Date.now()}`;
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      id: errorMessageId,
                      role: 'assistant' as const,
                      parts: [
                        {
                          type: 'text',
                          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                      ],
                      metadata: {
                        senderName: 'System',
                        originalRole: 'agent' as const,
                        createdAt: Date.now(),
                      },
                    },
                  ],
                }
              : s,
          ),
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          streamingSessionIdRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [runAgentLoop],
  );

  /**
   * 恢复当前活动的软暂停会话（如果有）。
   */
  const resumeActiveSession = useCallback(async (): Promise<void> => {
    const active = sessionsRef.current.find(
      (s) => (s.type === 'qa' || s.type === 'discussion') && s.status === 'active',
    );
    if (active) {
      await resumeSession(active.id);
    }
  }, [resumeSession]);

  /**
   * 向活动会话发送消息
   */
  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      let sessionId = activeSessionId;

      // 中断活动生成：中止流并在最后的智能体消息后追加 "..."
      if (isStreaming && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;

        if (sessionId) {
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId) return s;
              const messages = [...s.messages];
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant') {
                  const parts = [...messages[i].parts];
                  for (let j = parts.length - 1; j >= 0; j--) {
                    if (parts[j].type === 'text') {
                      const textPart = parts[j] as {
                        type: 'text';
                        text: string;
                      };
                      parts[j] = {
                        type: 'text',
                        text: (textPart.text || '') + '...',
                      } as UIMessage<ChatMessageMetadata>['parts'][number];
                      messages[i] = { ...messages[i], parts };
                      return { ...s, messages, updatedAt: Date.now() };
                    }
                  }
                  break;
                }
              }
              return s;
            }),
          );
        }
      }

      // 发送前验证模型配置
      const modelConfig = getCurrentModelConfig();
      if (!modelConfig.modelId) {
        toast.error(t('settings.modelNotConfigured'));
        return;
      }
      if (modelConfig.requiresApiKey && !modelConfig.apiKey && !modelConfig.isServerConfigured) {
        toast.error(t('settings.setupNeeded'), {
          description: t('settings.apiKeyDesc'),
        });
        return;
      }

      // 当没有可追加的活动问答会话时创建新会话。
      // 已完成的会话不应被复用 —— 应创建新的会话。
      const activeSession = sessionsRef.current.find((s) => s.id === sessionId);
      const needNewSession =
        !sessionId || activeSession?.type === 'lecture' || activeSession?.status === 'completed';

      if (needNewSession) {
        // 创建新会话前结束所有活动的问答/讨论会话
        const activeQAOrDiscussion = sessionsRef.current.filter(
          (s) => (s.type === 'qa' || s.type === 'discussion') && s.status === 'active',
        );
        for (const session of activeQAOrDiscussion) {
          await endSession(session.id);
        }
        sessionId = await createSession('qa', 'Q&A');
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      streamingSessionIdRef.current = sessionId;
      setIsStreaming(true);

      const now = Date.now();
      const userMessageId = `user-${now}`;

      // 从设置 store 读取所有选中的智能体 ID
      const settingsState = useSettingsStore.getState();
      const agentIds: string[] =
        settingsState.selectedAgentIds?.length > 0 ? settingsState.selectedAgentIds : ['default-1'];

      const userMessage: UIMessage<ChatMessageMetadata> = {
        id: userMessageId,
        role: 'user',
        parts: [{ type: 'text', text: content }],
        metadata: {
          senderName: t('common.you'),
          senderAvatar: USER_AVATAR,
          originalRole: 'user',
          createdAt: now,
        },
      };

      // 从 ref 读取当前会话数据（避免过时闭包并保持更新器纯净）
      const existingSession = sessionsRef.current.find((s) => s.id === sessionId);
      const sessionMessages: UIMessage<ChatMessageMetadata>[] = existingSession
        ? [...existingSession.messages, userMessage]
        : [userMessage];
      const sessionType: SessionType = existingSession?.type || 'qa';

      // 纯更新器 —— 无副作用
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === sessionId);
        if (exists) {
          return prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [...s.messages, userMessage],
                  status: 'active' as SessionStatus,
                  updatedAt: now,
                }
              : s,
          );
        } else {
          const newSession: ChatSession = {
            id: sessionId!,
            type: 'qa',
            title: 'Q&A',
            status: 'active',
            messages: [userMessage],
            config: {
              agentIds,
              maxTurns: 0, // 运行时未使用 —— 前端循环管理 maxTurns
              currentTurn: 0,
              defaultAgentId: agentIds[0],
            },
            toolCalls: [],
            pendingToolCalls: [],
            createdAt: now,
            updatedAt: now,
          };
          return [...prev, newSession];
        }
      });

      const currentState = useStageStore.getState();

      try {
        log.info(
          `[ChatArea] Sending message: "${content.slice(0, 50)}..." agents: ${agentIds.join(', ')}`,
        );

        const userProfileState = useUserProfileStore.getState();
        const mc = getCurrentModelConfig();

        await runAgentLoop(
          sessionId!,
          {
            messages: sessionMessages,
            storeState: {
              stage: currentState.stage,
              scenes: currentState.scenes,
              currentSceneId: currentState.currentSceneId,
              mode: currentState.mode,
              whiteboardOpen: useCanvasStore.getState().whiteboardOpen,
            },
            config: {
              agentIds,
              sessionType,
            },
            userProfile: {
              nickname: userProfileState.nickname || undefined,
              bio: userProfileState.bio || undefined,
            },
            apiKey: mc.apiKey,
            baseUrl: mc.baseUrl,
            model: mc.modelString,
          },
          controller,
          sessionType,
        );
      } catch (error) {
        // 忽略 AbortError —— 这是故意的（用户中断）
        if (error instanceof DOMException && error.name === 'AbortError') {
          log.info('[ChatArea] Request aborted by user');
          return;
        }

        log.error('[ChatArea] Error:', error);

        // 创建错误消息，因为没有预先创建的助手消息
        const errorMessageId = `error-${Date.now()}`;
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      id: errorMessageId,
                      role: 'assistant' as const,
                      parts: [
                        {
                          type: 'text',
                          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                      ],
                      metadata: {
                        senderName: 'System',
                        originalRole: 'agent' as const,
                        createdAt: Date.now(),
                      },
                    },
                  ],
                }
              : s,
          ),
        );
      } finally {
        // 仅当这仍是活动的控制器时才清理（避免与中断竞争）
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          streamingSessionIdRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [activeSessionId, isStreaming, createSession, endSession, runAgentLoop, t],
  );

  /**
   * 启动讨论，由智能体先发言
   */
  const startDiscussion = useCallback(
    async (request: DiscussionRequest): Promise<void> => {
      log.info(`[ChatArea] Starting discussion: "${request.topic}"`);

      // 启动讨论前验证模型配置
      const modelConfig = getCurrentModelConfig();
      if (!modelConfig.modelId) {
        toast.error(t('settings.modelNotConfigured'));
        return;
      }
      if (modelConfig.requiresApiKey && !modelConfig.apiKey && !modelConfig.isServerConfigured) {
        toast.error(t('settings.setupNeeded'), {
          description: t('settings.apiKeyDesc'),
        });
        return;
      }

      // 自动结束之前活动的问答/讨论会话以确保只有一个活动
      const activeQAOrDiscussion = sessionsRef.current.filter(
        (s) => (s.type === 'qa' || s.type === 'discussion') && s.status === 'active',
      );
      for (const session of activeQAOrDiscussion) {
        await endSession(session.id);
      }

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      const agentId = request.agentId || 'default-1';

      // 从设置 store 读取所有选中的智能体 ID
      const settingsState = useSettingsStore.getState();
      const agentIds: string[] =
        settingsState.selectedAgentIds?.length > 0
          ? [...settingsState.selectedAgentIds]
          : [agentId];
      // 确保触发智能体被包含
      if (!agentIds.includes(agentId)) {
        agentIds.unshift(agentId);
      }

      // 无预先创建的助手消息 —— agent_start 事件动态创建它们
      const newSession: ChatSession = {
        id: sessionId,
        type: 'discussion',
        title: request.topic,
        status: 'active',
        messages: [],
        config: {
          agentIds,
          maxTurns: 0, // 运行时未使用 —— 前端循环管理 maxTurns
          currentTurn: 0,
          triggerAgentId: agentId,
        },
        toolCalls: [],
        pendingToolCalls: [],
        createdAt: now,
        updatedAt: now,
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(sessionId);
      setExpandedSessionIds((prev) => new Set([...prev, sessionId]));

      const controller = new AbortController();
      abortControllerRef.current = controller;
      streamingSessionIdRef.current = sessionId;
      setIsStreaming(true);

      const currentState = useStageStore.getState();

      try {
        const userProfileState = useUserProfileStore.getState();
        const mc = getCurrentModelConfig();

        await runAgentLoop(
          sessionId,
          {
            messages: [],
            storeState: {
              stage: currentState.stage,
              scenes: currentState.scenes,
              currentSceneId: currentState.currentSceneId,
              mode: currentState.mode,
              whiteboardOpen: useCanvasStore.getState().whiteboardOpen,
            },
            config: {
              agentIds,
              sessionType: 'discussion',
              discussionTopic: request.topic,
              discussionPrompt: request.prompt,
              triggerAgentId: agentId,
            },
            userProfile: {
              nickname: userProfileState.nickname || undefined,
              bio: userProfileState.bio || undefined,
            },
            apiKey: mc.apiKey,
            baseUrl: mc.baseUrl,
            model: mc.modelString,
          },
          controller,
          'discussion',
        );
      } catch (error) {
        // 忽略 AbortError —— 这是故意的（用户中断）
        if (error instanceof DOMException && error.name === 'AbortError') {
          log.info('[ChatArea] Discussion aborted by user');
          return;
        }

        log.error('[ChatArea] Discussion error:', error);

        // 创建错误消息，因为没有预先创建的助手消息
        const errorMessageId = `error-${Date.now()}`;
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      id: errorMessageId,
                      role: 'assistant' as const,
                      parts: [
                        {
                          type: 'text',
                          text: `Error starting discussion: ${error instanceof Error ? error.message : String(error)}`,
                        },
                      ],
                      metadata: {
                        senderName: 'System',
                        originalRole: 'agent' as const,
                        createdAt: Date.now(),
                      },
                    },
                  ],
                }
              : s,
          ),
        );
      } finally {
        // 仅当这仍是活动的控制器时才清理（避免与中断竞争）
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          streamingSessionIdRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t 来自 i18n 上下文，是稳定的
    [endSession, runAgentLoop],
  );

  /**
   * 处理中断
   */
  const handleInterrupt = useCallback(() => {
    if (!abortControllerRef.current) return;

    log.info('[ChatArea] Interrupting active request');
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    streamingSessionIdRef.current = null;
  }, []);

  /**
   * 为场景启动课程会话。
   * 创建单个助手消息，所有动作将追加到此消息。
   * 去重：如果找到相同 sceneId 的现有活动课程会话则返回该会话。
   */
  const startLecture = useCallback(
    async (sceneId: string): Promise<string> => {
      // 检查是否存在相同 sceneId 的课程会话（活动或已完成）
      const existing = sessions.find(
        (s) =>
          s.type === 'lecture' &&
          s.sceneId === sceneId &&
          (s.status === 'active' || s.status === 'completed'),
      );
      if (existing) {
        // 重新激活已完成的会话，使聊天面板再次将其显示为活动状态。
        // 动作不会被重新追加，因为 lastActionIndex 已覆盖它们。
        if (existing.status === 'completed') {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === existing.id ? { ...s, status: 'active' as SessionStatus } : s,
            ),
          );
          // 恢复课程追踪 ref（由 endSession 清除）
          const messageId = existing.messages[0]?.id;
          if (messageId) {
            lectureMessageIds.current.set(existing.id, messageId);
          }
          if (existing.lastActionIndex !== undefined) {
            lectureLastActionIndexRef.current.set(existing.id, existing.lastActionIndex);
          }
        }
        setActiveSessionId(existing.id);
        setExpandedSessionIds((prev) => new Set([...prev, existing.id]));
        return existing.id;
      }

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      const messageId = `lecture-msg-${now}`;

      const scene = useStageStore.getState().scenes.find((s) => s.id === sceneId);
      const title = scene?.title || t('chat.lecture');

      const agentConfig = useAgentRegistry.getState().getAgent('default-1');

      // 创建带有单个助手消息的会话（所有动作在此追加部分）
      const lectureMessage: UIMessage<ChatMessageMetadata> = {
        id: messageId,
        role: 'assistant',
        parts: [],
        metadata: {
          senderName: agentConfig?.name || t('settings.agentNames.default-1'),
          senderAvatar: agentConfig?.avatar,
          originalRole: 'teacher',
          agentId: 'default-1',
          createdAt: now,
        },
      };

      const newSession: ChatSession = {
        id: sessionId,
        type: 'lecture',
        title,
        status: 'active',
        messages: [lectureMessage],
        config: {
          agentIds: ['default-1'],
          maxTurns: 0,
          currentTurn: 0,
        },
        toolCalls: [],
        pendingToolCalls: [],
        sceneId,
        lastActionIndex: -1,
        createdAt: now,
        updatedAt: now,
      };

      lectureMessageIds.current.set(sessionId, messageId);

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(sessionId);
      setExpandedSessionIds((prev) => new Set([...prev, sessionId]));

      log.info(`[ChatArea] Created lecture session: ${sessionId} for scene ${sceneId}`);
      return sessionId;
    },
    [sessions, t],
  );

  /**
   * 通过 StreamBuffer 将课程动作添加到单个消息气泡。
   * 语音 → pushText + sealText（缓冲区处理节奏）。
   * 聚光灯/激光笔/讨论 → pushAction（标签在前置文本显示后出现）。
   */
  const addLectureMessage = useCallback(
    (sessionId: string, action: Action, actionIndex: number) => {
      const messageId = lectureMessageIds.current.get(sessionId);
      if (!messageId) return;

      // 如果此动作已在之前的运行中追加则跳过
      const lastIndex = lectureLastActionIndexRef.current.get(sessionId) ?? -1;
      if (actionIndex <= lastIndex) return;
      lectureLastActionIndexRef.current.set(sessionId, actionIndex);

      // 更新会话中的 lastActionIndex
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, lastActionIndex: actionIndex, updatedAt: Date.now() } : s,
        ),
      );

      // 获取或创建此课程会话的缓冲区
      let buffer = buffersRef.current.get(sessionId);
      if (!buffer || buffer.disposed) {
        buffer = createBufferForSession(sessionId, 'lecture');
      }

      if (action.type === 'speech') {
        buffer.pushText(messageId, action.text, 'default-1');
        buffer.sealText(messageId);
      } else if (
        action.type === 'spotlight' ||
        action.type === 'laser' ||
        action.type === 'discussion'
      ) {
        const now = Date.now();
        buffer.pushAction({
          messageId,
          actionId: `${action.type}-${now}`,
          actionName: action.type,
          params:
            action.type === 'spotlight'
              ? {
                  elementId: action.elementId,
                  dimOpacity: (action as SpotlightAction).dimOpacity,
                }
              : action.type === 'laser'
                ? { elementId: action.elementId }
                : {
                    topic: (action as DiscussionAction).topic,
                    prompt: (action as DiscussionAction).prompt,
                  },
          agentId: 'default-1',
        });
      }
    },
    [createBufferForSession],
  );

  // 为外部消费者派生活动会话类型
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeSessionType = activeSession?.type ?? null;

  const getLectureMessageId = useCallback((sessionId: string): string | null => {
    return lectureMessageIds.current.get(sessionId) ?? null;
  }, []);

  /** 暂停会话的缓冲区（课程暂停支持）。 */
  const pauseBuffer = useCallback((sessionId: string) => {
    const buf = buffersRef.current.get(sessionId);
    if (buf) buf.pause();
  }, []);

  /** 恢复会话的缓冲区。 */
  const resumeBuffer = useCallback((sessionId: string) => {
    const buf = buffersRef.current.get(sessionId);
    if (buf) buf.resume();
  }, []);

  return {
    sessions,
    activeSessionId,
    activeSessionType,
    expandedSessionIds,
    isStreaming,
    createSession,
    endSession,
    endActiveSession,
    softPauseActiveSession,
    resumeActiveSession,
    sendMessage,
    startDiscussion,
    startLecture,
    addLectureMessage,
    toggleSessionExpand,
    handleInterrupt,
    getLectureMessageId,
    pauseBuffer,
    resumeBuffer,
  };
}
