'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SceneSidebar } from './stage/scene-sidebar';
import { Header } from './header';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { Roundtable } from '@/components/roundtable';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, TriggerEvent, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
// 播放状态持久化已移除 — 刷新始终从头开始
import { ChatArea, type ChatAreaRef } from '@/components/chat/chat-area';
import { agentsToParticipants, useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { VisuallyHidden } from 'radix-ui';

/**
 * Stage 组件
 *
 * 课堂/课程的主容器。
 * 结合侧边栏（场景导航）和内容区域（场景查看器）。
 * 支持两种模式：autonomous（自主）和 playback（播放）。
 */
export function Stage({
  onRetryOutline,
}: {
  onRetryOutline?: (outlineId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { mode, getCurrentScene, scenes, currentSceneId, setCurrentSceneId, generatingOutlines } =
    useStageStore();
  const failedOutlines = useStageStore.use.failedOutlines();

  const currentScene = getCurrentScene();

  // 布局状态来自设置存储（通过 localStorage 持久化）
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const chatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
  const setChatAreaWidth = useSettingsStore((s) => s.setChatAreaWidth);
  const chatAreaCollapsed = useSettingsStore((s) => s.chatAreaCollapsed);
  const setChatAreaCollapsed = useSettingsStore((s) => s.setChatAreaCollapsed);

  // PlaybackEngine 状态
  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [playbackCompleted, setPlaybackCompleted] = useState(false); // 区分"从未播放"的空闲和"已完成"的空闲
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null); // 来自 PlaybackEngine（讲课）
  const [liveSpeech, setLiveSpeech] = useState<string | null>(null); // 来自缓冲区（讨论/问答）
  const [speechProgress, setSpeechProgress] = useState<number | null>(null); // StreamBuffer 揭示进度（0–1）
  const [discussionTrigger, setDiscussionTrigger] = useState<TriggerEvent | null>(null);

  // 说话智能体追踪（Issue 2）
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);

  // 思考状态（Issue 5）
  const [thinkingState, setThinkingState] = useState<{
    stage: string;
    agentId?: string;
  } | null>(null);

  // 提示用户状态（Issue 7）
  const [isCueUser, setIsCueUser] = useState(false);

  // 结束闪烁状态（Issue 3）
  const [showEndFlash, setShowEndFlash] = useState(false);
  const [endFlashSessionType, setEndFlashSessionType] = useState<'qa' | 'discussion'>('discussion');

  // 流式状态用于停止按钮（Issue 1）
  const [chatIsStreaming, setChatIsStreaming] = useState(false);
  const [chatSessionType, setChatSessionType] = useState<string | null>(null);

  // 话题待处理状态：会话软暂停，气泡保持可见，等待用户输入
  const [isTopicPending, setIsTopicPending] = useState(false);

  // 用于聊天区域播放高亮的活跃气泡 ID（Issue 8）
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);

  // 场景切换确认对话框状态
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);

  // 白板状态（来自 canvas store，以便 AI 工具可以打开它）
  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  // 从设置存储中获取选中的智能体（Zustand）
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);

  // 从选中的智能体生成参与者
  const participants = useMemo(
    () => agentsToParticipants(selectedAgentIds, t),
    [selectedAgentIds, t],
  );

  // 为讨论触发选择一个学生智能体（优先级：学生 > 非教师 > 回退）
  const pickStudentAgent = useCallback((): string => {
    const registry = useAgentRegistry.getState();
    const agents = selectedAgentIds
      .map((id) => registry.getAgent(id))
      .filter((a): a is AgentConfig => a != null);
    const students = agents.filter((a) => a.role === 'student');
    if (students.length > 0) {
      return students[Math.floor(Math.random() * students.length)].id;
    }
    const nonTeachers = agents.filter((a) => a.role !== 'teacher');
    if (nonTeachers.length > 0) {
      return nonTeachers[Math.floor(Math.random() * nonTeachers.length)].id;
    }
    return agents[0]?.id || 'default-1';
  }, [selectedAgentIds]);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const chatAreaRef = useRef<ChatAreaRef>(null);
  const lectureSessionIdRef = useRef<string | null>(null);
  const lectureActionCounterRef = useRef(0);
  const discussionAbortRef = useRef<AbortController | null>(null);
  // 防止手动停止触发 onDiscussionEnd 时出现双重闪烁的守卫
  const manualStopRef = useRef(false);
  // 单调计数器，每次场景切换时递增 — 用于丢弃过期的 SSE 回调
  const sceneEpochRef = useRef(0);
  // 当为 true 时，下次引擎初始化将自动开始播放（用于自动播放场景切换）
  const autoStartRef = useRef(false);

  /**
   * 软暂停：中断当前智能体流但保持会话活跃。
   * 用于点击气泡暂停按钮或在问答/讨论期间打开输入框时。
   * 不会结束话题 — 用户可以在同一会话中继续发言。
   * 保留 liveSpeech（追加"..."）和 speakingAgentId，使圆桌气泡
   * 停留在被中断智能体的文本上。
   */
  const doSoftPause = useCallback(async () => {
    await chatAreaRef.current?.softPauseActiveSession();
    // 在 live speech 后追加 "..." 以在圆桌气泡中显示中断
    // 仅在有实际文本被中断时才标注 — 在纯导演思考期间
    // （prev 为 null，未分配智能体），保持 liveSpeech 不变
    // 以避免出现虚假的教师气泡
    setLiveSpeech((prev) => (prev !== null ? prev + '...' : null));
    // 保持 speakingAgentId — 气泡身份得以保留
    setThinkingState(null);
    setChatIsStreaming(false);
    setIsTopicPending(true);
    // 不清除 chatSessionType、speakingAgentId 或 liveSpeech
    // 不显示结束闪烁
    // 不调用 handleEndDiscussion — 引擎保持当前状态
  }, []);

  /**
   * 恢复软暂停的话题：使用现有会话消息重新调用 /chat。
   * 导演选择下一个智能体继续。
   */
  const doResumeTopic = useCallback(async () => {
    // 立即清除旧气泡 — 不在被中断的文本上停留
    setIsTopicPending(false);
    setLiveSpeech(null);
    setSpeakingAgentId(null);
    setThinkingState({ stage: 'director' });
    setChatIsStreaming(true);
    // 发起新的聊天轮次 — SSE 事件将驱动 thinking → agent_start → speech
    await chatAreaRef.current?.resumeActiveSession();
  }, []);

  /** 重置所有实时/讨论状态（由 doSessionCleanup 和 onDiscussionEnd 共享）*/
  const resetLiveState = useCallback(() => {
    setLiveSpeech(null);
    setSpeakingAgentId(null);
    setSpeechProgress(null);
    setThinkingState(null);
    setIsCueUser(false);
    setIsTopicPending(false);
    setChatIsStreaming(false);
    setChatSessionType(null);
  }, []);

  /** 完整场景重置（场景切换）— resetLiveState + 讲课/视觉状态 */
  const resetSceneState = useCallback(() => {
    resetLiveState();
    setPlaybackCompleted(false);
    setLectureSpeech(null);
    setSpeechProgress(null);
    setShowEndFlash(false);
    setActiveBubbleId(null);
    setDiscussionTrigger(null);
  }, [resetLiveState]);

  /**
   * 统一会话清理 — 由圆桌停止按钮和聊天区域结束按钮共同调用。
   * 处理：引擎状态转换、结束闪烁、圆桌状态清除。
   */
  const doSessionCleanup = useCallback(() => {
    const activeType = chatSessionType;

    // 引擎清理 — 设置守卫以避免 onDiscussionEnd 触发双重闪烁
    manualStopRef.current = true;
    engineRef.current?.handleEndDiscussion();
    manualStopRef.current = false;

    // 显示结束闪烁，使用正确的会话类型
    if (activeType === 'qa' || activeType === 'discussion') {
      setEndFlashSessionType(activeType);
      setShowEndFlash(true);
      setTimeout(() => setShowEndFlash(false), 1800);
    }

    resetLiveState();
  }, [chatSessionType, resetLiveState]);

  // 共享的停止讨论处理器（由圆桌和画布工具栏共同使用）
  const handleStopDiscussion = useCallback(async () => {
    await chatAreaRef.current?.endActiveSession();
    doSessionCleanup();
  }, [doSessionCleanup]);

  // 场景切换时初始化播放引擎
  useEffect(() => {
    // 递增 epoch，以便丢弃来自前一个场景的过期 SSE 回调
    sceneEpochRef.current++;

    // 结束任何活跃的问答/讨论会话 — 这会同步中止 use-chat-sessions 内部的
    // SSE 流（abortControllerRef.abort()），防止过期的 onLiveSpeech 回调
    // 泄漏到新场景中。
    chatAreaRef.current?.endActiveSession();

    // 同时中止引擎级别的讨论控制器
    if (discussionAbortRef.current) {
      discussionAbortRef.current.abort();
      discussionAbortRef.current = null;
    }

    // 重置所有圆桌/实时状态，确保场景完全隔离
    resetSceneState();

    if (!currentScene || !currentScene.actions || currentScene.actions.length === 0) {
      engineRef.current = null;
      setEngineMode('idle');

      return;
    }

    // 停止之前的引擎
    if (engineRef.current) {
      engineRef.current.stop();
    }

    // 为播放创建 ActionEngine（带 audioPlayer 用于 TTS）
    const actionEngine = new ActionEngine(useStageStore, audioPlayerRef.current);

    // 创建新的 PlaybackEngine
    const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
      onModeChange: (mode) => {
        setEngineMode(mode);
      },
      onSceneChange: (_sceneId) => {
        // 场景切换由引擎处理
      },
      onSpeechStart: (text) => {
        setLectureSpeech(text);
        // 将讲课内容添加到会话中，使用递增索引进行去重
        // 聊天区域的节奏由 StreamBuffer 控制（onTextReveal）
        if (lectureSessionIdRef.current) {
          const idx = lectureActionCounterRef.current++;
          const speechId = `speech-${Date.now()}`;
          chatAreaRef.current?.addLectureMessage(
            lectureSessionIdRef.current,
            { id: speechId, type: 'speech', text } as Action,
            idx,
          );
          // 追踪活跃气泡用于高亮（Issue 8）
          const msgId = chatAreaRef.current?.getLectureMessageId(lectureSessionIdRef.current!);
          if (msgId) setActiveBubbleId(msgId);
        }
      },
      onSpeechEnd: () => {
        // 不要清除 lectureSpeech — 让它保持到下一个 onSpeechStart
        // 替换它或场景切换时。在这里清除会导致回退到 idleText（第一句）。
        setActiveBubbleId(null);
      },
      onEffectFire: (effect: Effect) => {
        // 将效果添加到讲课会话中，使用递增索引
        if (
          lectureSessionIdRef.current &&
          (effect.kind === 'spotlight' || effect.kind === 'laser')
        ) {
          const idx = lectureActionCounterRef.current++;
          chatAreaRef.current?.addLectureMessage(
            lectureSessionIdRef.current,
            {
              id: `${effect.kind}-${Date.now()}`,
              type: effect.kind,
              elementId: effect.targetId,
            } as Action,
            idx,
          );
        }
      },
      onProactiveShow: (trigger) => {
        if (!trigger.agentId) {
          // 原地修改，使 engine.currentTrigger 也获得 agentId
          // （confirmDiscussion 从同一对象引用读取 agentId）
          trigger.agentId = pickStudentAgent();
        }
        setDiscussionTrigger(trigger);
      },
      onProactiveHide: () => {
        setDiscussionTrigger(null);
      },
      onDiscussionConfirmed: (topic, prompt, agentId) => {
        // 通过 ChatArea 启动 SSE 讨论
        handleDiscussionSSE(topic, prompt, agentId);
      },
      onDiscussionEnd: () => {
        // 中止任何活跃的 SSE
        if (discussionAbortRef.current) {
          discussionAbortRef.current.abort();
          discussionAbortRef.current = null;
        }
        setDiscussionTrigger(null);
        // 清除圆桌状态（幂等 — 可能已被 doSessionCleanup 清除）
        resetLiveState();
        // 仅对引擎发起的结束显示闪烁（手动停止由 doSessionCleanup 处理）
        if (!manualStopRef.current) {
          setEndFlashSessionType('discussion');
          setShowEndFlash(true);
          setTimeout(() => setShowEndFlash(false), 1800);
        }
        // 如果所有动作已耗尽（讨论是最后一个动作），标记
        // 播放已完成，以便气泡显示重置而不是播放。
        if (engineRef.current?.isExhausted()) {
          setPlaybackCompleted(true);
        }
      },
      onUserInterrupt: (text) => {
        // 用户中断 → 通过聊天开始讨论
        chatAreaRef.current?.sendMessage(text);
      },
      isAgentSelected: (agentId) => {
        const ids = useSettingsStore.getState().selectedAgentIds;
        return ids.includes(agentId);
      },
      getPlaybackSpeed: () => useSettingsStore.getState().playbackSpeed || 1,
      onComplete: () => {
        // lectureSpeech 故意不清除 — 最后一句保持可见
        // 直到场景切换（自动播放）或用户重新开始。
        // 场景切换 effect 处理重置。
        setPlaybackCompleted(true);

        // 播放完成时结束讲课会话
        if (lectureSessionIdRef.current) {
          chatAreaRef.current?.endSession(lectureSessionIdRef.current);
          lectureSessionIdRef.current = null;
        }
        // 自动播放：短暂暂停后切换到下一个场景
        const { autoPlayLecture } = useSettingsStore.getState();
        if (autoPlayLecture) {
          setTimeout(() => {
            const stageState = useStageStore.getState();
            if (!useSettingsStore.getState().autoPlayLecture) return;
            const allScenes = stageState.scenes;
            const curId = stageState.currentSceneId;
            const idx = allScenes.findIndex((s) => s.id === curId);
            if (idx >= 0 && idx < allScenes.length - 1) {
              const currentScene = allScenes[idx];
              if (
                currentScene.type === 'quiz' ||
                currentScene.type === 'interactive' ||
                currentScene.type === 'pbl'
              ) {
                return;
              }
              autoStartRef.current = true;
              stageState.setCurrentSceneId(allScenes[idx + 1].id);
            } else if (idx === allScenes.length - 1 && stageState.generatingOutlines.length > 0) {
              // 最后一个场景已耗尽但下一个仍在生成 — 跳转到待处理页面
              const currentScene = allScenes[idx];
              if (
                currentScene.type === 'quiz' ||
                currentScene.type === 'interactive' ||
                currentScene.type === 'pbl'
              ) {
                return;
              }
              autoStartRef.current = true;
              stageState.setCurrentSceneId(PENDING_SCENE_ID);
            }
          }, 1500);
        }
      },
    });

    engineRef.current = engine;

    // 如果由自动播放场景切换触发，则自动开始
    if (autoStartRef.current) {
      autoStartRef.current = false;
      (async () => {
        if (currentScene && chatAreaRef.current) {
          const sessionId = await chatAreaRef.current.startLecture(currentScene.id);
          lectureSessionIdRef.current = sessionId;
          lectureActionCounterRef.current = 0;
        }
        engine.start();
      })();
    } else {
      // 加载保存的播放状态并恢复位置（但从不自动播放）。
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在场景切换时重新运行，函数是稳定的引用
  }, [currentScene]);

  // 卸载时清理
  useEffect(() => {
    const audioPlayer = audioPlayerRef.current;
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      audioPlayer.destroy();
      if (discussionAbortRef.current) {
        discussionAbortRef.current.abort();
      }
    };
  }, []);

  // 将静音状态从设置存储同步到 audioPlayer
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  useEffect(() => {
    audioPlayerRef.current.setMuted(ttsMuted);
  }, [ttsMuted]);

  // 将音量从设置存储同步到 audioPlayer
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  useEffect(() => {
    if (!ttsMuted) {
      audioPlayerRef.current.setVolume(ttsVolume);
    }
  }, [ttsVolume, ttsMuted]);

  // 将播放速度同步到音频播放器（用于实时更新当前音频）
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
  useEffect(() => {
    audioPlayerRef.current.setPlaybackRate(playbackSpeed);
  }, [playbackSpeed]);

  /**
   * 处理讨论 SSE — POST /api/chat 并将事件推送到引擎
   */
  const handleDiscussionSSE = useCallback(
    async (topic: string, prompt?: string, agentId?: string) => {
      // 在 ChatArea 中开始讨论显示（讲课语音独立保留）
      chatAreaRef.current?.startDiscussion({
        topic,
        prompt,
        agentId: agentId || 'default-1',
      });
      // 讨论开始时自动切换到聊天标签页
      chatAreaRef.current?.switchToTab('chat');
      // 立即标记为流式传输，用于同步停止按钮
      setChatIsStreaming(true);
      setChatSessionType('discussion');
      // 乐观思考：立即显示思考动画（与 onMessageSend 相同）
      setThinkingState({ stage: 'director' });
    },
    [],
  );

  // 用于空闲显示的第一段讲课文本（在此处提取用于 playbackView）
  const firstSpeechText = useMemo(
    () => currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
    [currentScene],
  );

  // 正在发言的智能体是否为学生（用于气泡角色派生）
  const speakingStudentFlag = useMemo(() => {
    if (!speakingAgentId) return false;
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    return agent?.role !== 'teacher';
  }, [speakingAgentId]);

  // 集中派生的播放视图
  const playbackView = useMemo(
    () =>
      computePlaybackView({
        engineMode,
        lectureSpeech,
        liveSpeech,
        speakingAgentId,
        thinkingState,
        isCueUser,
        isTopicPending,
        chatIsStreaming,
        discussionTrigger,
        playbackCompleted,
        idleText: firstSpeechText,
        speakingStudent: speakingStudentFlag,
        sessionType: chatSessionType,
      }),
    [
      engineMode,
      lectureSpeech,
      liveSpeech,
      speakingAgentId,
      thinkingState,
      isCueUser,
      isTopicPending,
      chatIsStreaming,
      discussionTrigger,
      playbackCompleted,
      firstSpeechText,
      speakingStudentFlag,
      chatSessionType,
    ],
  );

  const isTopicActive = playbackView.isTopicActive;

  /**
   * 受控场景切换 — 如果有活跃话题，切换前显示确认对话框。
   * 如果立即切换返回 true，如果被拦截（显示对话框）返回 false。
   */
  const gatedSceneSwitch = useCallback(
    (targetSceneId: string): boolean => {
      if (targetSceneId === currentSceneId) return false;
      if (isTopicActive) {
        setPendingSceneId(targetSceneId);
        return false;
      }
      setCurrentSceneId(targetSceneId);
      return true;
    },
    [currentSceneId, isTopicActive, setCurrentSceneId],
  );

  /** 用户通过 AlertDialog 确认场景切换 */
  const confirmSceneSwitch = useCallback(() => {
    if (!pendingSceneId) return;
    chatAreaRef.current?.endActiveSession();
    doSessionCleanup();
    setCurrentSceneId(pendingSceneId);
    setPendingSceneId(null);
  }, [pendingSceneId, setCurrentSceneId, doSessionCleanup]);

  /** 用户通过 AlertDialog 取消场景切换 */
  const cancelSceneSwitch = useCallback(() => {
    setPendingSceneId(null);
  }, []);

  // 播放/暂停切换
  const handlePlayPause = async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const mode = engine.getMode();
    if (mode === 'playing' || mode === 'live') {
      engine.pause();
      // 暂停讲课缓冲区，使文本立即停止
      if (lectureSessionIdRef.current) {
        chatAreaRef.current?.pauseBuffer(lectureSessionIdRef.current);
      }
    } else if (mode === 'paused') {
      engine.resume();
      // 恢复讲课缓冲区
      if (lectureSessionIdRef.current) {
        chatAreaRef.current?.resumeBuffer(lectureSessionIdRef.current);
      }
    } else {
      const wasCompleted = playbackCompleted;
      setPlaybackCompleted(false);
      // 开始播放 — 创建/复用讲课会话
      if (currentScene && chatAreaRef.current) {
        const sessionId = await chatAreaRef.current.startLecture(currentScene.id);
        lectureSessionIdRef.current = sessionId;
      }
      if (wasCompleted) {
        // 从头开始（用户在完成后点击重新开始）
        lectureActionCounterRef.current = 0;
        engine.start();
      } else {
        // 从当前位置继续（例如讨论结束后）
        engine.continuePlayback();
      }
    }
  };

  // 上一个场景（受控）
  const handlePreviousScene = () => {
    if (isPendingScene) {
      // 从待处理页 → 跳转到最后一个真实场景
      if (scenes.length > 0) {
        gatedSceneSwitch(scenes[scenes.length - 1].id);
      }
      return;
    }
    const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
    if (currentIndex > 0) {
      gatedSceneSwitch(scenes[currentIndex - 1].id);
    }
  };

  // 下一个场景（受控）
  const handleNextScene = () => {
    if (isPendingScene) return; // 已在待处理页，无处可去
    const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
    if (currentIndex < scenes.length - 1) {
      gatedSceneSwitch(scenes[currentIndex + 1].id);
    } else if (hasNextPending) {
      // 在最后一个真实场景 → 前进到待处理页
      setCurrentSceneId(PENDING_SCENE_ID);
    }
  };

  // 获取场景信息
  const isPendingScene = currentSceneId === PENDING_SCENE_ID;
  const hasNextPending = generatingOutlines.length > 0;
  const currentSceneIndex = isPendingScene
    ? scenes.length
    : scenes.findIndex((s) => s.id === currentSceneId);
  const totalScenesCount = scenes.length + (hasNextPending ? 1 : 0);

  // 获取动作信息
  const totalActions = currentScene?.actions?.length || 0;

  // 白板切换
  const handleWhiteboardToggle = () => {
    setWhiteboardOpen(!whiteboardOpen);
  };

  // 将引擎模式映射到 CanvasArea 期望的引擎状态
  const canvasEngineState = (() => {
    switch (engineMode) {
      case 'playing':
      case 'live':
        return 'playing';
      case 'paused':
        return 'paused';
      default:
        return 'idle';
    }
  })();

  // 从触发器构建圆桌 ProactiveCard 的讨论请求
  const discussionRequest: DiscussionAction | null = discussionTrigger
    ? {
        type: 'discussion',
        id: discussionTrigger.id,
        topic: discussionTrigger.question,
        prompt: discussionTrigger.prompt,
        agentId: discussionTrigger.agentId || 'default-1',
      }
    : null;

  // 计算场景查看器高度（减去 Header 的 80px 高度）
  const sceneViewerHeight = (() => {
    const headerHeight = 80; // Header h-20 = 80px
    if (mode === 'playback') {
      return `calc(100% - ${headerHeight + 192}px)`; // Header + 圆桌
    }
    return `calc(100% - ${headerHeight}px)`;
  })();

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* 场景侧边栏 */}
      <SceneSidebar
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
        onSceneSelect={gatedSceneSwitch}
        onRetryOutline={onRetryOutline}
      />

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* 头部 */}
        <Header currentSceneTitle={currentScene?.title || ''} />

        {/* 画布区域 */}
        <div
          className="overflow-hidden relative flex-1 min-h-0 isolate"
          style={{
            height: sceneViewerHeight,
          }}
          suppressHydrationWarning
        >
          <CanvasArea
            currentScene={currentScene}
            currentSceneIndex={currentSceneIndex}
            scenesCount={totalScenesCount}
            mode={mode}
            engineState={canvasEngineState}
            isLiveSession={
              chatIsStreaming || isTopicPending || engineMode === 'live' || !!chatSessionType
            }
            whiteboardOpen={whiteboardOpen}
            sidebarCollapsed={sidebarCollapsed}
            chatCollapsed={chatAreaCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
            onPrevSlide={handlePreviousScene}
            onNextSlide={handleNextScene}
            onPlayPause={handlePlayPause}
            onWhiteboardClose={handleWhiteboardToggle}
            showStopDiscussion={
              engineMode === 'live' ||
              (chatIsStreaming && (chatSessionType === 'qa' || chatSessionType === 'discussion'))
            }
            onStopDiscussion={handleStopDiscussion}
            hideToolbar={mode === 'playback'}
            isPendingScene={isPendingScene}
            isGenerationFailed={
              isPendingScene && failedOutlines.some((f) => f.id === generatingOutlines[0]?.id)
            }
            onRetryGeneration={
              onRetryOutline && generatingOutlines[0]
                ? () => onRetryOutline(generatingOutlines[0].id)
                : undefined
            }
          />
        </div>

        {/* 圆桌区域 */}
        {mode === 'playback' && (
          <Roundtable
            mode={mode}
            initialParticipants={participants}
            playbackView={playbackView}
            currentSpeech={liveSpeech}
            lectureSpeech={lectureSpeech}
            idleText={firstSpeechText}
            playbackCompleted={playbackCompleted}
            discussionRequest={discussionRequest}
            engineMode={engineMode}
            isStreaming={chatIsStreaming}
            sessionType={
              chatSessionType === 'qa'
                ? 'qa'
                : chatSessionType === 'discussion'
                  ? 'discussion'
                  : undefined
            }
            speakingAgentId={speakingAgentId}
            speechProgress={speechProgress}
            showEndFlash={showEndFlash}
            endFlashSessionType={endFlashSessionType}
            thinkingState={thinkingState}
            isCueUser={isCueUser}
            isTopicPending={isTopicPending}
            onMessageSend={(msg) => {
              // 清除软暂停状态 — 用户正在继续话题
              if (isTopicPending) {
                setIsTopicPending(false);
                setLiveSpeech(null);
                setSpeakingAgentId(null);
              }
              // 用户在播放期间中断 — handleUserInterrupt 触发 onUserInterrupt
              // 回调，该回调已调用 sendMessage，所以跳过下面的直接 sendMessage
              // 以避免发送两次。
              // 包含 'paused' 因为 onInputActivate 在用户完成输入前暂停引擎 —
              // 如果不这样做，中断位置永远不会被保存，问答结束后恢复会跳到下一句。
              if (
                engineRef.current &&
                (engineMode === 'playing' || engineMode === 'live' || engineMode === 'paused')
              ) {
                engineRef.current.handleUserInterrupt(msg);
              } else {
                chatAreaRef.current?.sendMessage(msg);
              }
              // 用户发送消息时自动切换到聊天标签页
              chatAreaRef.current?.switchToTab('chat');
              setIsCueUser(false);
              // 立即标记为流式传输，用于同步停止按钮
              setChatIsStreaming(true);
              setChatSessionType(chatSessionType || 'qa');
              // 乐观思考：立即显示思考动画，以便在 userMessage 过期
              // 和 SSE 思考事件之间没有空白间隙。
              // 真实的 SSE 事件会用相同或更新的值覆盖此值。
              setThinkingState({ stage: 'director' });
            }}
            onDiscussionStart={() => {
              // 用户点击 ProactiveCard 上的"加入"
              engineRef.current?.confirmDiscussion();
            }}
            onDiscussionSkip={() => {
              // 用户点击 ProactiveCard 上的"跳过"
              engineRef.current?.skipDiscussion();
            }}
            onStopDiscussion={handleStopDiscussion}
            onInputActivate={async () => {
              // 如果正在流式传输，软暂停问答/讨论（打开输入 = 隐式暂停）
              if (chatIsStreaming) {
                await doSoftPause();
              }
              // 同时暂停播放引擎
              if (engineRef.current && (engineMode === 'playing' || engineMode === 'live')) {
                engineRef.current.pause();
              }
            }}
            onSoftPause={doSoftPause}
            onResumeTopic={doResumeTopic}
            onPlayPause={handlePlayPause}
            totalActions={totalActions}
            currentActionIndex={0}
            currentSceneIndex={currentSceneIndex}
            scenesCount={totalScenesCount}
            whiteboardOpen={whiteboardOpen}
            sidebarCollapsed={sidebarCollapsed}
            chatCollapsed={chatAreaCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
            onPrevSlide={handlePreviousScene}
            onNextSlide={handleNextScene}
            onWhiteboardClose={handleWhiteboardToggle}
          />
        )}
      </div>

      {/* 聊天区域 */}
      <ChatArea
        ref={chatAreaRef}
        width={chatAreaWidth}
        onWidthChange={setChatAreaWidth}
        collapsed={chatAreaCollapsed}
        onCollapseChange={setChatAreaCollapsed}
        activeBubbleId={activeBubbleId}
        onActiveBubble={(id) => setActiveBubbleId(id)}
        currentSceneId={currentSceneId}
        onLiveSpeech={(text, agentId) => {
          // 在调用时捕获 epoch — 如果场景已切换则丢弃
          const epoch = sceneEpochRef.current;
          // 使用 queueMicrotask 让任何待处理的场景切换重置先完成
          queueMicrotask(() => {
            if (sceneEpochRef.current !== epoch) return; // 过期 — 场景已切换
            setLiveSpeech(text);
            if (agentId !== undefined) {
              setSpeakingAgentId(agentId);
            }
            if (text !== null || agentId) {
              setChatIsStreaming(true);
              setChatSessionType(chatAreaRef.current?.getActiveSessionType?.() ?? null);
              setIsTopicPending(false);
            } else if (text === null && agentId === null) {
              setChatIsStreaming(false);
              // 不要在这里清除 chatSessionType — 导演提示用户时
              // 停止按钮需要它（cue_user → done → liveSpeech null）。
              // 它会在 doSessionCleanup 和场景切换时正确清除。
            }
          });
        }}
        onSpeechProgress={(ratio) => {
          const epoch = sceneEpochRef.current;
          queueMicrotask(() => {
            if (sceneEpochRef.current !== epoch) return;
            setSpeechProgress(ratio);
          });
        }}
        onThinking={(state) => {
          const epoch = sceneEpochRef.current;
          queueMicrotask(() => {
            if (sceneEpochRef.current !== epoch) return;
            setThinkingState(state);
          });
        }}
        onCueUser={(_fromAgentId, _prompt) => {
          setIsCueUser(true);
        }}
        onStopSession={doSessionCleanup}
      />

      {/* 场景切换确认对话框 */}
      <AlertDialog
        open={!!pendingSceneId}
        onOpenChange={(open) => {
          if (!open) cancelSceneSwitch();
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden border-0 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]">
          <VisuallyHidden.Root>
            <AlertDialogTitle>{t('stage.confirmSwitchTitle')}</AlertDialogTitle>
          </VisuallyHidden.Root>
          {/* 顶部强调条 */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />

          <div className="px-6 pt-5 pb-2 flex flex-col items-center text-center">
            {/* 图标 */}
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 ring-1 ring-amber-200/50 dark:ring-amber-700/30">
              <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            </div>
            {/* 标题 */}
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1.5">
              {t('stage.confirmSwitchTitle')}
            </h3>
            {/* 描述 */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {t('stage.confirmSwitchMessage')}
            </p>
          </div>

          <AlertDialogFooter className="px-6 pb-5 pt-3 flex-row gap-3">
            <AlertDialogCancel onClick={cancelSceneSwitch} className="flex-1 rounded-xl">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSceneSwitch}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md shadow-amber-200/50 dark:shadow-amber-900/30"
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
