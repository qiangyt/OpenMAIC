/**
 * 多智能体编排的共享类型定义
 *
 * 定义基于会话的多智能体对话系统，
 * 支持 QA、讨论和讲座会话类型。
 */

import type { UIMessage } from 'ai';

// 会话类型
export type SessionType = 'qa' | 'discussion' | 'lecture';
export type SessionStatus = 'idle' | 'active' | 'interrupted' | 'completed';

/**
 * 附加到聊天消息的元数据
 */
export interface ChatMessageMetadata {
  senderName?: string;
  senderAvatar?: string;
  originalRole?: 'teacher' | 'agent' | 'user';
  actions?: MessageAction[];
  agentId?: string;
  agentColor?: string;
  createdAt?: number;
  interrupted?: boolean;
}

/**
 * 可附加到消息的操作按钮
 */
export interface MessageAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'spotlight' | 'highlight' | 'reset' | 'insert' | 'draw';
}

/**
 * 表示与一个或多个智能体对话的聊天会话
 */
export interface ChatSession {
  id: string;
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: UIMessage<ChatMessageMetadata>[];
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
  lastActionIndex?: number;
}

/**
 * 会话配置
 */
export interface SessionConfig {
  agentIds: string[];
  maxTurns: number;
  currentTurn: number;
  triggerAgentId?: string; // 讨论：第一个发言的智能体
  defaultAgentId?: string; // QA：响应的智能体
}

/**
 * 发送给客户端执行的待处理工具调用请求
 */
export interface ToolCallRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  agentId: string;
  status: 'pending' | 'executing';
  requestedAt: number;
}

/**
 * 带有结果的已完成工具调用记录
 */
export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  agentId: string;
  result?: unknown;
  error?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  requestedAt: number;
  completedAt?: number;
}

/**
 * 用于流式会话更新的服务器发送事件类型
 */
export type SessionEvent =
  | { type: 'message'; data: UIMessage<ChatMessageMetadata> }
  | {
      type: 'tool_request';
      data: { sessionId: string; toolCalls: ToolCallRequest[] };
    }
  | { type: 'tool_complete'; data: ToolCallRecord }
  | {
      type: 'agent_switch';
      data: { fromAgentId: string | null; toAgentId: string };
    }
  | { type: 'session_status'; data: { status: SessionStatus; reason?: string } }
  | { type: 'error'; data: { message: string } }
  | { type: 'done'; data: SessionSummary }
  | {
      type: 'text_start';
      data: { messageId: string; agentId: string; agentName: string };
    }
  | { type: 'text_delta'; data: { messageId: string; delta: string } }
  | { type: 'text_end'; data: { messageId: string; content: string } };

/**
 * 会话完成时发送的摘要数据
 */
export interface SessionSummary {
  sessionId: string;
  totalTurns: number;
  totalMessages: number;
  totalToolCalls: number;
  endReason: string;
}

/**
 * 创建新会话的请求体
 */
export interface CreateSessionRequest {
  type: SessionType;
  title?: string;
  trigger: {
    message?: string;
    agentIds: string[];
    triggerAgentId?: string;
    maxTurns?: number;
  };
}

/**
 * 向会话发送消息的请求体
 */
export interface SendMessageRequest {
  content: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  storeState: {
    stage: unknown;
    scenes: unknown[];
    currentSceneId: string | null;
    mode: 'autonomous' | 'playback';
    whiteboardOpen: boolean;
  };
}

/**
 * 提交工具结果的请求体
 */
export interface ToolResultsRequest {
  results: ToolCallRecord[];
}

/**
 * 会话列表项（不含完整消息，以提高效率）
 */
export interface SessionListItem {
  id: string;
  type: SessionType;
  title: string;
  status: SessionStatus;
  messageCount: number;
  toolCallCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 将完整的 ChatSession 转换为列表项（不含消息）
 */
export function toSessionListItem(session: ChatSession): SessionListItem {
  return {
    id: session.id,
    type: session.type,
    title: session.title,
    status: session.status,
    messageCount: session.messages.length,
    toolCallCount: session.toolCalls.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * 讲座笔记中的单个条目 — 语音文本或操作标记。
 * 顺序与场景中的原始操作序列匹配。
 */
export type LectureNoteItem =
  | { kind: 'speech'; text: string }
  | { kind: 'action'; type: string; label?: string };

/**
 * 一个场景的已完成讲座笔记条目。
 * 由 Scene.actions 构建，显示在笔记标签页中。
 */
export interface LectureNoteEntry {
  sceneId: string;
  sceneTitle: string;
  sceneOrder: number;
  items: LectureNoteItem[];
  completedAt: number;
}

// ==================== 无状态多智能体 API 类型 ====================

import type { Stage, Scene, StageMode } from '@/lib/types/stage';
import type { AgentTurnSummary, WhiteboardActionRecord } from '@/lib/orchestration/director-prompt';

/**
 * 在每个智能体请求之间传递的累积调度器状态。
 * 由客户端维护 — 后端是无状态的。
 */
export interface DirectorState {
  turnCount: number;
  agentResponses: AgentTurnSummary[];
  whiteboardLedger: WhiteboardActionRecord[];
}

/**
 * 无状态聊天 API 的请求体
 * 每次请求时所有状态都由客户端发送
 */
export interface StatelessChatRequest {
  /** 对话历史（由客户端维护） */
  messages: UIMessage<ChatMessageMetadata>[];
  /** 当前应用状态 */
  storeState: {
    stage: Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
    mode: StageMode;
    whiteboardOpen: boolean;
  };
  /** 智能体配置 */
  config: {
    agentIds: string[];
    sessionType?: 'qa' | 'discussion';
    /** 讨论主题（用于智能体发起的讨论） */
    discussionTopic?: string;
    /** 讨论提示（用于智能体发起的讨论） */
    discussionPrompt?: string;
    /** 讨论中哪个智能体应首先发言 */
    triggerAgentId?: string;
    /** 生成的（非默认）智能体的完整配置，不在服务端注册表中 */
    agentConfigs?: Array<{
      id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      allowedActions: string[];
      priority: number;
      isGenerated?: boolean;
      boundStageId?: string;
    }>;
  };
  /** 来自之前每个智能体请求的累积调度器状态 */
  directorState?: DirectorState;
  /** 用于个性化的用户资料 */
  userProfile?: {
    nickname?: string;
    bio?: string;
  };
  /** OpenAI 兼容 API 凭证 */
  apiKey: string;
  baseUrl?: string;
  model?: string;
  providerType?: string;
  requiresApiKey?: boolean;
}

/**
 * 从结构化输出解析的动作
 */
export interface ParsedAction {
  actionId: string;
  actionName: string;
  params: Record<string, unknown>;
}

/** @deprecated 请使用 ParsedAction 代替 */
export type ParsedToolCall = ParsedAction;

/**
 * 无状态聊天 API 的服务器发送事件
 */
export type StatelessEvent =
  | {
      type: 'agent_start';
      data: {
        messageId: string;
        agentId: string;
        agentName: string;
        agentAvatar?: string;
        agentColor?: string;
      };
    }
  | { type: 'agent_end'; data: { messageId: string; agentId: string } }
  | { type: 'text_delta'; data: { content: string; messageId?: string } }
  | {
      type: 'action';
      data: {
        actionId: string;
        actionName: string;
        params: Record<string, unknown>;
        agentId: string;
        messageId?: string;
      };
    }
  | {
      type: 'thinking';
      data: { stage: 'director' | 'agent_loading'; agentId?: string };
    }
  | { type: 'cue_user'; data: { fromAgentId?: string; prompt?: string } }
  | {
      type: 'done';
      data: {
        totalActions: number;
        totalAgents: number;
        agentHadContent?: boolean;
        directorState?: DirectorState;
      };
    }
  | { type: 'error'; data: { message: string } };
