/**
 * 导演图 — 用于多智能体编排的 LangGraph 状态图
 *
 * 统一的图拓扑结构（单智能体和多智能体相同）：
 *
 *   START → director ──(end)──→ END
 *              │
 *              └─(next)→ agent_generate ──→ director (循环)
 *
 * 导演节点根据智能体数量调整其策略：
 *   - 单智能体：纯代码逻辑（无 LLM）。在第 0 轮调度该智能体，
 *     然后在后续轮次中提示用户。
 *   - 多智能体：基于 LLM 的决策（第 0 轮触发智能体和轮次限制有代码快速路径）。
 *
 * 使用 LangGraph 的自定义流模式：每个节点通过 config.writer()
 * 推送 StatelessEvent 块，用于实时 SSE 传输。
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { LanguageModel } from 'ai';

import { AISdkLangGraphAdapter } from './ai-sdk-adapter';
import type { StatelessEvent } from '@/lib/types/chat';
import type { StatelessChatRequest } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import {
  buildStructuredPrompt,
  summarizeConversation,
  convertMessagesToOpenAI,
} from './prompt-builder';
import { buildDirectorPrompt, parseDirectorDecision } from './director-prompt';
import { getEffectiveActions } from './tool-schemas';
import type { AgentTurnSummary, WhiteboardActionRecord } from './director-prompt';
import { parseStructuredChunk, createParserState, finalizeParser } from './stateless-generate';
import { createLogger } from '@/lib/logger';

const log = createLogger('DirectorGraph');

// ==================== 状态定义 ====================

/**
 * 编排图的 LangGraph 状态注解
 */
const OrchestratorState = Annotation.Root({
  // 输入（在图入口处设置一次）
  messages: Annotation<StatelessChatRequest['messages']>,
  storeState: Annotation<StatelessChatRequest['storeState']>,
  availableAgentIds: Annotation<string[]>,
  maxTurns: Annotation<number>,
  languageModel: Annotation<LanguageModel>,
  thinkingConfig: Annotation<ThinkingConfig | null>,
  discussionContext: Annotation<{ topic: string; prompt?: string } | null>,
  triggerAgentId: Annotation<string | null>,
  userProfile: Annotation<{ nickname?: string; bio?: string } | null>,
  /** 请求作用域的智能体配置，用于生成的智能体（不在默认注册表中） */
  agentConfigOverrides: Annotation<Record<string, AgentConfig>>,

  // 可变（由节点更新）
  currentAgentId: Annotation<string | null>,
  turnCount: Annotation<number>,
  agentResponses: Annotation<AgentTurnSummary[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  whiteboardLedger: Annotation<WhiteboardActionRecord[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  shouldEnd: Annotation<boolean>,
  totalActions: Annotation<number>,
});

type OrchestratorStateType = typeof OrchestratorState.State;

/**
 * 查找智能体配置：优先使用请求作用域的覆盖，然后是全局注册表。
 * 这使服务器保持无状态 — 生成的智能体配置随请求传递。
 */
function resolveAgent(state: OrchestratorStateType, agentId: string): AgentConfig | undefined {
  return state.agentConfigOverrides[agentId] ?? useAgentRegistry.getState().getAgent(agentId);
}

// ==================== 导演节点 ====================

/**
 * 统一的导演：决定下一个发言的智能体。
 *
 * 策略根据智能体数量变化：
 *   单智能体 — 纯代码逻辑，零 LLM 调用：
 *     第 0 轮：调度唯一的智能体
 *     第 1+ 轮：提示用户发言（保持会话活跃以便后续跟进）
 *
 *   多智能体 — 基于 LLM，带有代码快速路径：
 *     第 0 轮 + triggerAgentId：调度触发智能体（跳过 LLM）
 *     其他情况：LLM 决定下一个智能体 / USER / END
 */
async function directorNode(
  state: OrchestratorStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<OrchestratorStateType>> {
  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch {
      /* 中止后控制器已关闭 */
    }
  };
  const isSingleAgent = state.availableAgentIds.length <= 1;

  // ── 轮次限制检查（适用于单智能体和多智能体） ──
  if (state.turnCount >= state.maxTurns) {
    log.info(`[Director] Turn limit reached (${state.turnCount}/${state.maxTurns}), ending`);
    return { shouldEnd: true };
  }

  // ── 单智能体：纯代码导演 ──
  if (isSingleAgent) {
    const agentId = state.availableAgentIds[0] || 'default-1';

    if (state.turnCount === 0) {
      // 第一轮：调度智能体
      log.info(`[Director] Single agent: dispatching "${agentId}"`);
      write({ type: 'thinking', data: { stage: 'agent_loading', agentId } });
      return { currentAgentId: agentId, shouldEnd: false };
    }

    // 智能体已响应：提示用户进行后续跟进
    log.info(`[Director] Single agent: cueing user after "${agentId}"`);
    write({ type: 'cue_user', data: { fromAgentId: agentId } });
    return { shouldEnd: true };
  }

  // ── 多智能体：第 0 轮带触发器的快速路径 ──
  if (state.turnCount === 0 && state.triggerAgentId) {
    const triggerId = state.triggerAgentId;
    if (state.availableAgentIds.includes(triggerId)) {
      log.info(`[Director] First turn: dispatching trigger agent "${triggerId}"`);
      write({
        type: 'thinking',
        data: { stage: 'agent_loading', agentId: triggerId },
      });
      return { currentAgentId: triggerId, shouldEnd: false };
    }
    log.warn(
      `[Director] Trigger agent "${triggerId}" not in available agents, falling through to LLM`,
    );
  }

  // ── 多智能体：基于 LLM 的决策 ──
  const agents: AgentConfig[] = state.availableAgentIds
    .map((id) => resolveAgent(state, id))
    .filter((a): a is AgentConfig => a != null);

  if (agents.length === 0) {
    return { shouldEnd: true };
  }

  write({ type: 'thinking', data: { stage: 'director' } });

  const openaiMessages = convertMessagesToOpenAI(state.messages);
  const conversationSummary = summarizeConversation(openaiMessages);

  const prompt = buildDirectorPrompt(
    agents,
    conversationSummary,
    state.agentResponses,
    state.turnCount,
    state.discussionContext,
    state.triggerAgentId,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.storeState.whiteboardOpen,
  );

  const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);

  try {
    const result = await adapter._generate(
      [new SystemMessage(prompt), new HumanMessage('Decide which agent should speak next.')], // 中文：决定哪个智能体应该接下来发言
      { signal: config.signal } as Record<string, unknown>,
    );

    const content = result.generations[0]?.text || '';
    log.info(`[Director] Raw decision: ${content}`);

    const decision = parseDirectorDecision(content);

    if (decision.shouldEnd || !decision.nextAgentId) {
      log.info('[Director] Decision: END');
      return { shouldEnd: true };
    }

    if (decision.nextAgentId === 'USER') {
      log.info('[Director] Decision: cue USER to speak');
      write({
        type: 'cue_user',
        data: { fromAgentId: state.currentAgentId || undefined },
      });
      return { shouldEnd: true };
    }

    const agentExists = agents.some((a) => a.id === decision.nextAgentId);
    if (!agentExists) {
      log.warn(`[Director] Unknown agent "${decision.nextAgentId}", ending`);
      return { shouldEnd: true };
    }

    write({
      type: 'thinking',
      data: { stage: 'agent_loading', agentId: decision.nextAgentId },
    });

    log.info(`[Director] Decision: dispatch agent "${decision.nextAgentId}"`);
    return {
      currentAgentId: decision.nextAgentId,
      shouldEnd: false,
    };
  } catch (error) {
    log.error('[Director] Error:', error);
    return { shouldEnd: true };
  }
}

function directorCondition(state: OrchestratorStateType): 'agent_generate' | typeof END {
  return state.shouldEnd ? END : 'agent_generate';
}

// ==================== 智能体生成节点 ====================

/**
 * 为一个智能体运行生成。通过 config.writer() 流式传输
 * agent_start、text_delta、action 和 agent_end 事件。
 */
async function runAgentGeneration(
  state: OrchestratorStateType,
  agentId: string,
  config: LangGraphRunnableConfig,
): Promise<{
  contentPreview: string;
  actionCount: number;
  whiteboardActions: WhiteboardActionRecord[];
}> {
  const agentConfig = resolveAgent(state, agentId);
  if (!agentConfig) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch (e) {
      log.warn(`[AgentGenerate] write failed for ${agentId}:`, e);
    }
  };
  const messageId = `assistant-${agentId}-${Date.now()}`;

  write({
    type: 'agent_start',
    data: {
      messageId,
      agentId,
      agentName: agentConfig.name,
      agentAvatar: agentConfig.avatar,
      agentColor: agentConfig.color,
    },
  });

  // 计算有效动作：按场景类型过滤以实现纵深防御
  // 例如，对于非幻灯片场景，即使静态 allowedActions 中包含，也会移除 spotlight/laser
  const currentScene = state.storeState.currentSceneId
    ? state.storeState.scenes.find((s) => s.id === state.storeState.currentSceneId)
    : undefined;
  const sceneType = currentScene?.type;
  const effectiveActions = getEffectiveActions(agentConfig.allowedActions, sceneType);

  const discussionContext = state.discussionContext || undefined;
  const systemPrompt = buildStructuredPrompt(
    agentConfig,
    state.storeState,
    discussionContext,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.agentResponses,
  );
  const openaiMessages = convertMessagesToOpenAI(state.messages, agentId);
  const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);

  const lcMessages = [
    new SystemMessage(systemPrompt),
    ...openaiMessages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  // 确保消息列表以 HumanMessage 结尾。
  // 在智能体感知的角色映射后，其他智能体的消息变为 user 角色，
  // 所以末尾是 AIMessage 的可能性较小。但仍需防范边缘情况
  //（例如智能体自己之前的响应是历史记录中的最后一条）。
  const lastMsg = lcMessages[lcMessages.length - 1];
  if (!lcMessages.some((m) => m instanceof HumanMessage)) {
    lcMessages.push(new HumanMessage('Please begin.')); // 中文：请开始
  } else if (lastMsg instanceof AIMessage) {
    lcMessages.push(new HumanMessage("It's your turn to speak. Respond from your perspective.")); // 中文：轮到你发言了。从你的角度回应
  }

  const parserState = createParserState();
  let fullText = '';
  let actionCount = 0;
  const whiteboardActions: WhiteboardActionRecord[] = [];

  try {
    for await (const chunk of adapter.streamGenerate(lcMessages, {
      signal: config.signal,
    })) {
      if (chunk.type === 'delta') {
        const parseResult = parseStructuredChunk(chunk.content, parserState);

        // 通过 `ordered` 数组按原始交错顺序发送事件。
        // ordered 数组跟踪解析器第 5 步的完整项目；
        // 尾部的部分文本增量（第 6 步）在 textChunks 中但不在 ordered 中。
        let emittedTextCount = 0;
        if (parseResult.ordered.length > 0 || parseResult.textChunks.length > 0) {
          log.debug(
            `[AgentGenerate] Parse: ordered=${parseResult.ordered.length} (${parseResult.ordered.map((e) => e.type).join(',')}), textChunks=${parseResult.textChunks.length}, actions=${parseResult.actions.length}, done=${parseResult.isDone}`,
          );
        }
        for (const entry of parseResult.ordered) {
          if (entry.type === 'text') {
            const rawText = parseResult.textChunks[entry.index];
            if (!rawText) {
              log.warn(
                `[AgentGenerate] Ordered text entry index=${entry.index} but textChunks[${entry.index}] is empty`,
              );
              continue;
            }
            const text = rawText.replace(/^>+\s?/gm, '');
            if (!text) continue;
            fullText += text;
            write({
              type: 'text_delta',
              data: { content: text, messageId },
            });
            emittedTextCount++;
          } else if (entry.type === 'action') {
            const ac = parseResult.actions[entry.index];
            if (!ac) continue;
            if (!effectiveActions.includes(ac.actionName)) {
              log.warn(
                `[AgentGenerate] Agent ${agentConfig.name} attempted disallowed action: ${ac.actionName}, skipping`,
              );
              continue;
            }
            actionCount++;
            // 将白板操作记录到账本
            if (ac.actionName.startsWith('wb_')) {
              whiteboardActions.push({
                actionName: ac.actionName as WhiteboardActionRecord['actionName'],
                agentId,
                agentName: agentConfig.name,
                params: ac.params,
              });
            }
            write({
              type: 'action',
              data: {
                actionId: ac.actionId,
                actionName: ac.actionName,
                params: ac.params,
                agentId,
                messageId,
              },
            });
          }
        }

        // 发送 ordered 未覆盖的尾部部分文本增量
        for (let i = emittedTextCount; i < parseResult.textChunks.length; i++) {
          const rawText = parseResult.textChunks[i];
          if (!rawText) continue;
          const text = rawText.replace(/^>+\s?/gm, '');
          if (!text) continue;
          fullText += text;
          write({
            type: 'text_delta',
            data: { content: text, messageId },
          });
        }
      }
    }

    // 完成：如果模型未产生有效 JSON，则发送剩余内容
    const finalResult = finalizeParser(parserState);
    for (const entry of finalResult.ordered) {
      if (entry.type === 'text') {
        const rawText = finalResult.textChunks[entry.index];
        if (!rawText) continue;
        const text = rawText.replace(/^>+\s?/gm, '');
        if (!text) continue;
        fullText += text;
        write({
          type: 'text_delta',
          data: { content: text, messageId },
        });
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    log.error(`[AgentGenerate] Error for ${agentConfig.name}:`, error);
    write({
      type: 'error',
      data: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  write({
    type: 'agent_end',
    data: { messageId, agentId },
  });

  return {
    contentPreview: fullText.slice(0, 300),
    actionCount,
    whiteboardActions,
  };
}

/**
 * 智能体生成节点 — 运行一个智能体，然后循环回导演节点。
 */
async function agentGenerateNode(
  state: OrchestratorStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<OrchestratorStateType>> {
  const agentId = state.currentAgentId;
  if (!agentId) {
    return { shouldEnd: true };
  }

  const agentConfig = resolveAgent(state, agentId);
  const result = await runAgentGeneration(state, agentId, config);

  if (!result.contentPreview && result.actionCount === 0) {
    log.warn(
      `[AgentGenerate] Agent "${agentConfig?.name || agentId}" produced empty response (no text, no actions)`,
    );
  }

  return {
    turnCount: state.turnCount + 1,
    totalActions: state.totalActions + result.actionCount,
    agentResponses: [
      {
        agentId,
        agentName: agentConfig?.name || agentId,
        contentPreview: result.contentPreview,
        actionCount: result.actionCount,
        whiteboardActions: result.whiteboardActions,
      },
    ],
    whiteboardLedger: result.whiteboardActions,
    currentAgentId: null,
  };
}

// ==================== 图构建 ====================

/**
 * 创建编排 LangGraph 状态图。
 *
 * 拓扑结构：
 *   START → director ──(end)──→ END
 *              │
 *              └─(next)→ agent_generate ──→ director (循环)
 */
export function createOrchestrationGraph() {
  const graph = new StateGraph(OrchestratorState)
    .addNode('director', directorNode)
    .addNode('agent_generate', agentGenerateNode)
    .addEdge(START, 'director')
    .addConditionalEdges('director', directorCondition, {
      agent_generate: 'agent_generate',
      [END]: END,
    })
    .addEdge('agent_generate', 'director');

  return graph.compile();
}

/**
 * 从 StatelessChatRequest 和预创建的 LanguageModel 实例
 * 构建编排图的初始状态。
 */
export function buildInitialState(
  request: StatelessChatRequest,
  languageModel: LanguageModel,
  thinkingConfig?: ThinkingConfig,
): typeof OrchestratorState.State {
  // 为生成的智能体构建请求作用域的配置覆盖。
  // 这些随每个请求传递 — 无需服务器端持久化。
  const agentConfigOverrides: Record<string, AgentConfig> = {};
  if (request.config.agentConfigs?.length) {
    for (const cfg of request.config.agentConfigs) {
      agentConfigOverrides[cfg.id] = {
        ...cfg,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  const discussionContext = request.config.discussionTopic
    ? {
        topic: request.config.discussionTopic,
        prompt: request.config.discussionPrompt,
      }
    : null;

  const incoming = request.directorState;
  const turnCount = incoming?.turnCount ?? 0;

  return {
    messages: request.messages,
    storeState: request.storeState,
    availableAgentIds: request.config.agentIds,
    maxTurns: turnCount + 1, // 恰好允许再多一个 director→agent 循环
    languageModel,
    thinkingConfig: thinkingConfig ?? null,
    discussionContext,
    triggerAgentId: request.config.triggerAgentId || null,
    userProfile: request.userProfile || null,
    agentConfigOverrides,
    currentAgentId: null,
    turnCount,
    agentResponses: incoming?.agentResponses ?? [],
    whiteboardLedger: incoming?.whiteboardLedger ?? [],
    shouldEnd: false,
    totalActions: 0,
  };
}
