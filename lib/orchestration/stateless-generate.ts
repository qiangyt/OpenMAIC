/**
 * 无状态多智能体生成
 *
 * 单次生成，使用结构化 JSON 数组输出格式：
 * [{"type":"action","name":"...","params":{...}},{"type":"text","content":"natural speech"},...]
 *
 * 关键设计决策：
 * - 后端是无状态的（所有状态在请求/响应中）
 * - 单次生成过程（无 generate/tool/loop 循环）
 * - 文本是自然的老师语音，不是元评论
 * - 工具调用是静默动作 — 学生只能看到结果
 * - 动作和文本对象可以在数组中自由交错
 * - 使用 partial-json 实现不完整 JSON 的稳健流式处理
 *
 * 多智能体编排：
 * - 当配置多个智能体时，导演智能体决定谁发言
 * - 使用 LangGraph StateGraph 实现编排循环
 * - 事件通过 LangGraph 的自定义流模式流式传输
 */

import type { LanguageModel } from 'ai';
import type { StatelessChatRequest, StatelessEvent, ParsedAction } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { WhiteboardActionRecord } from './director-prompt';
import { createOrchestrationGraph, buildInitialState } from './director-graph';
import { parse as parsePartialJson, Allow } from 'partial-json';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';

const log = createLogger('StatelessGenerate');

// ==================== 结构化输出解析器 ====================

/**
 * 用于增量 JSON 数组解析的解析器状态。
 *
 * 累积来自 LLM 流的原始文本。一旦找到开头的 `[`，
 * 使用 `partial-json` 增量解析增长的数组。当新完整项目
 * 出现时发送它们，并为最后一个（可能不完整的）文本项
 * 流式传输部分文本内容增量。
 */
interface ParserState {
  /** 从 LLM 累积的原始文本 */
  buffer: string;
  /** 是否已找到开头的 `[` */
  jsonStarted: boolean;
  /** 已完全处理（已发送）的项目数 */
  lastParsedItemCount: number;
  /** 已为尾部部分文本项发送的文本内容长度 */
  lastPartialTextLength: number;
  /** 解析是否完成（找到结束的 `]`） */
  isDone: boolean;
}

/**
 * 创建初始解析器状态
 */
export function createParserState(): ParserState {
  return {
    buffer: '',
    jsonStarted: false,
    lastParsedItemCount: 0,
    lastPartialTextLength: 0,
    isDone: false,
  };
}

/**
 * 解析块的结果
 */
export interface ParseResult {
  textChunks: string[];
  actions: ParsedAction[];
  isDone: boolean;
  /** 记录文本和动作段原始交错顺序的有序序列 */
  ordered: Array<{ type: 'text'; index: number } | { type: 'action'; index: number }>;
}

/**
 * 将单个解析项发送到结果中，返回更新后的段索引。
 */
function emitItem(
  item: Record<string, unknown>,
  result: ParseResult,
  textSegmentIndex: number,
  actionSegmentIndex: number,
): { textSegmentIndex: number; actionSegmentIndex: number } {
  if (item.type === 'text') {
    const content = (item.content as string) || '';
    if (content) {
      result.textChunks.push(content);
      // 使用每次调用的数组索引（而非累积段索引），以便
      // director-graph 可以正确读取 result.textChunks[entry.index]。
      result.ordered.push({
        type: 'text',
        index: result.textChunks.length - 1,
      });
      return { textSegmentIndex: textSegmentIndex + 1, actionSegmentIndex };
    }
  } else if (item.type === 'action') {
    // 支持新格式（name/params）和旧格式（tool_name/parameters）
    const action: ParsedAction = {
      actionId:
        (item.action_id as string) || `action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      actionName: (item.name || item.tool_name) as string,
      params: (item.params || item.parameters || {}) as Record<string, unknown>,
    };
    result.actions.push(action);
    // 使用每次调用的数组索引（而非累积段索引），以便
    // director-graph 可以正确读取 result.actions[entry.index]。
    result.ordered.push({ type: 'action', index: result.actions.length - 1 });
    return { textSegmentIndex, actionSegmentIndex: actionSegmentIndex + 1 };
  }
  return { textSegmentIndex, actionSegmentIndex };
}

/**
 * 解析结构化 JSON 数组输出的流式块。
 *
 * LLM 预期产生类似以下的 JSON 数组：
 * [{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},
 *  {"type":"text","content":"Hello students..."},...]
 *
 * 此解析器：
 * 1. 将块累积到缓冲区
 * 2. 跳过 `[` 之前的任何前缀（例如 ```json\n、解释性文本）
 * 3. 使用 partial-json 增量解析增长的数组
 * 4. 发送新的完整项目（action→toolCall，text→textChunk）
 * 5. 对于尾部不完整的文本项，发送内容增量以进行流式传输
 * 6. 当缓冲区包含结束的 `]` 时标记完成
 *
 * @param chunk - 要解析的新文本块
 * @param state - 当前解析器状态（原地修改）
 * @returns 从此块解析的文本块和工具调用
 */
export function parseStructuredChunk(chunk: string, state: ParserState): ParseResult {
  const result: ParseResult = {
    textChunks: [],
    actions: [],
    isDone: false,
    ordered: [],
  };

  if (state.isDone) {
    return result;
  }

  state.buffer += chunk;

  // 第 1 步：如果尚未找到，查找开头的 `[`
  if (!state.jsonStarted) {
    const bracketIndex = state.buffer.indexOf('[');
    if (bracketIndex === -1) {
      return result;
    }
    // 删除 `[` 之前的所有内容（markdown 围栏、解释性文本等）
    state.buffer = state.buffer.slice(bracketIndex);
    state.jsonStarted = true;
  }

  // 第 2 步：检查数组是否完整（找到结束的 `]`）
  const trimmed = state.buffer.trimEnd();
  const isArrayClosed = trimmed.endsWith(']') && trimmed.length > 1;

  // 第 3 步：尝试增量解析 — 先用 jsonrepair（修复未转义的引号），回退到 partial-json
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial-json 返回 any[]
  let parsed: any[];
  try {
    const repaired = jsonrepair(state.buffer);
    parsed = JSON.parse(repaired);
  } catch {
    try {
      parsed = parsePartialJson(
        state.buffer,
        Allow.ARR | Allow.OBJ | Allow.STR | Allow.NUM | Allow.BOOL | Allow.NULL,
      );
    } catch {
      return result;
    }
  }

  if (!Array.isArray(parsed)) {
    return result;
  }

  // 第 4 步：确定有多少项目已完全完成
  // 当数组关闭时，所有项目都已完成。
  // 当仍在流式传输时，项目 [0..N-2] 已完成；项目 [N-1] 可能是部分的。
  const completeUpTo = isArrayClosed ? parsed.length : Math.max(0, parsed.length - 1);

  // 计算已发送项目的段索引
  let textSegmentIndex = 0;
  let actionSegmentIndex = 0;
  for (let i = 0; i < state.lastParsedItemCount && i < parsed.length; i++) {
    const item = parsed[i];
    if (item?.type === 'text') textSegmentIndex++;
    else if (item?.type === 'action') actionSegmentIndex++;
  }

  // 第 5 步：发送新完成的项目
  for (let i = state.lastParsedItemCount; i < completeUpTo; i++) {
    const item = parsed[i];
    if (!item || typeof item !== 'object') continue;

    // 如果此项之前是尾部部分文本项，我们已经增量
    // 流式传输了其内容。只发送剩余的增量，而非完整内容。
    if (
      i === state.lastParsedItemCount &&
      state.lastPartialTextLength > 0 &&
      item.type === 'text'
    ) {
      const content = item.content || '';
      const remaining = content.slice(state.lastPartialTextLength);
      if (remaining) {
        result.textChunks.push(remaining);
      }
      // 使用每次调用的数组索引以与 emitItem 修复保持一致
      result.ordered.push({
        type: 'text',
        index: result.textChunks.length - 1,
      });
      textSegmentIndex++;
      state.lastPartialTextLength = 0;
      continue;
    }

    const indices = emitItem(item, result, textSegmentIndex, actionSegmentIndex);
    textSegmentIndex = indices.textSegmentIndex;
    actionSegmentIndex = indices.actionSegmentIndex;
  }

  state.lastParsedItemCount = completeUpTo;

  // 第 6 步：为尾部项流式传输部分文本增量
  if (!isArrayClosed && parsed.length > completeUpTo) {
    const lastItem = parsed[parsed.length - 1];
    if (lastItem && typeof lastItem === 'object' && lastItem.type === 'text') {
      const content = lastItem.content || '';
      if (content.length > state.lastPartialTextLength) {
        result.textChunks.push(content.slice(state.lastPartialTextLength));
        state.lastPartialTextLength = content.length;
      }
    }
  }

  // 第 7 步：如果数组已关闭则标记完成
  if (isArrayClosed) {
    state.isDone = true;
    result.isDone = true;
    state.lastParsedItemCount = parsed.length;
    state.lastPartialTextLength = 0;
  }

  return result;
}

/**
 * 流结束后完成解析。
 *
 * 处理模型从未产生有效 JSON 数组的情况 —
 * 例如它输出了纯文本而非预期的 `[...]` 格式。
 * 将缓冲区中的任何内容作为单个文本项发送，以便
 * 前端仍能显示一些内容，而不是什么都不显示。
 */
export function finalizeParser(state: ParserState): ParseResult {
  const result: ParseResult = {
    textChunks: [],
    actions: [],
    isDone: true,
    ordered: [],
  };

  if (state.isDone) {
    return result;
  }

  const content = state.buffer.trim();
  if (!content) {
    return result;
  }

  if (!state.jsonStarted) {
    // 模型从未输出 `[` — 将整个缓冲区视为纯文本
    result.textChunks.push(content);
    result.ordered.push({ type: 'text', index: 0 });
  } else {
    // JSON 已开始但从未关闭 — 尝试最后一次解析
    const finalChunk = parseStructuredChunk('', state);
    result.textChunks.push(...finalChunk.textChunks);
    result.actions.push(...finalChunk.actions);
    result.ordered.push(...finalChunk.ordered);

    // 如果最终解析没有产生任何内容，将 `[` 后的原始文本作为回退发送
    if (result.textChunks.length === 0 && result.actions.length === 0) {
      const bracketIndex = content.indexOf('[');
      const raw = content.slice(bracketIndex + 1).trim();
      if (raw) {
        result.textChunks.push(raw);
        result.ordered.push({ type: 'text', index: 0 });
      }
    }
  }

  state.isDone = true;
  return result;
}

// ==================== 主生成函数 ====================

/**
 * 通过 LangGraph 编排进行无状态流式生成
 *
 * @param request - 包含完整状态的聊天请求
 * @param abortSignal - 用于取消的信号
 * @yields 用于流式传输的 StatelessEvent 对象
 */
export async function* statelessGenerate(
  request: StatelessChatRequest,
  abortSignal: AbortSignal,
  languageModel: LanguageModel,
  thinkingConfig?: ThinkingConfig,
): AsyncGenerator<StatelessEvent> {
  log.info(
    `[StatelessGenerate] Starting orchestration for agents: ${request.config.agentIds.join(', ')}`,
  );
  log.info(
    `[StatelessGenerate] Message count: ${request.messages.length}, turnCount: ${request.directorState?.turnCount ?? 0}`,
  );

  try {
    const graph = createOrchestrationGraph();
    const initialState = buildInitialState(request, languageModel, thinkingConfig);

    const stream = await graph.stream(initialState, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      streamMode: 'custom' as any,
      signal: abortSignal,
    });

    let totalActions = 0;
    let totalAgents = 0;
    // 跟踪本轮调度的智能体是否产生了任何文本或动作。
    // 每次 statelessGenerate 调用恰好处理一个智能体轮次（客户端在外部循环）。
    let agentHadContent = false;

    // 跟踪当前智能体轮次以构建更新的 directorState
    let currentAgentId: string | null = null;
    let currentAgentName: string | null = null;
    let contentPreview = '';
    let agentActionCount = 0;
    const agentWbActions: WhiteboardActionRecord[] = [];

    for await (const chunk of stream) {
      const event = chunk as StatelessEvent;

      if (event.type === 'agent_start') {
        totalAgents++;
        currentAgentId = event.data.agentId;
        currentAgentName = event.data.agentName;
        contentPreview = '';
        agentActionCount = 0;
        agentWbActions.length = 0;
      }
      if (event.type === 'text_delta' && contentPreview.length < 100) {
        contentPreview = (contentPreview + event.data.content).slice(0, 100);
        agentHadContent = true;
      }
      if (event.type === 'action') {
        totalActions++;
        agentActionCount++;
        agentHadContent = true;
        if (event.data.actionName.startsWith('wb_')) {
          agentWbActions.push({
            actionName: event.data.actionName as WhiteboardActionRecord['actionName'],
            agentId: event.data.agentId,
            agentName: currentAgentName || event.data.agentId,
            params: event.data.params,
          });
        }
      }

      yield event;
    }

    // 从传入状态 + 本轮数据构建更新的 directorState
    const incoming = request.directorState;
    const prevResponses = incoming?.agentResponses ?? [];
    const prevLedger = incoming?.whiteboardLedger ?? [];
    const prevTurnCount = incoming?.turnCount ?? 0;

    const directorState =
      totalAgents > 0
        ? {
            turnCount: prevTurnCount + 1,
            agentResponses: [
              ...prevResponses,
              {
                agentId: currentAgentId!,
                agentName: currentAgentName || currentAgentId!,
                contentPreview,
                actionCount: agentActionCount,
                whiteboardActions: [...agentWbActions],
              },
            ],
            whiteboardLedger: [...prevLedger, ...agentWbActions],
          }
        : {
            turnCount: prevTurnCount,
            agentResponses: prevResponses,
            whiteboardLedger: prevLedger,
          };

    yield {
      type: 'done',
      data: { totalActions, totalAgents, agentHadContent, directorState },
    };

    log.info(
      `[StatelessGenerate] Completed. Agents: ${totalAgents}, Actions: ${totalActions}, hadContent: ${agentHadContent}, turnCount: ${directorState.turnCount}`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      yield { type: 'error', data: { message: 'Request interrupted' } }; // 中文：请求被中断
    } else {
      log.error('[StatelessGenerate] Error:', error);
      yield {
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
