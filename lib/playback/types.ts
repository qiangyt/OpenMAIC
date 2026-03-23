/**
 * 播放类型 - 用于讲稿播放和实时讨论引擎的类型定义
 */

import type { PlaybackSnapshot } from '@/lib/utils/playback-storage';

export type { PlaybackSnapshot };

/** 视觉效果（用于 onEffectFire 回调） */
export type Effect =
  | { kind: 'spotlight'; targetId: string; dimOpacity?: number }
  | { kind: 'laser'; targetId: string; color?: string };

/** 引擎模式状态机 */
export type EngineMode = 'idle' | 'playing' | 'paused' | 'live';

/** 讨论主题状态 */
export type TopicState = 'active' | 'pending' | 'closed';

/** 触发事件（用于主动讨论卡片） */
export interface TriggerEvent {
  id: string;
  question: string;
  prompt?: string;
  agentId?: string;
}

/** 播放引擎回调 */
export interface PlaybackEngineCallbacks {
  onModeChange?: (mode: EngineMode) => void;
  onSceneChange?: (sceneId: string) => void;
  onSpeechStart?: (text: string) => void;
  onSpeechEnd?: () => void;
  onTextDelta?: (content: string) => void;
  onSpeakerChange?: (role: string) => void;
  onEffectFire?: (effect: Effect) => void;

  // 主动讨论
  onProactiveShow?: (trigger: TriggerEvent) => void;
  onProactiveHide?: () => void;

  // 讨论生命周期
  onDiscussionConfirmed?: (topic: string, prompt?: string, agentId?: string) => void;
  onDiscussionEnd?: () => void;
  onUserInterrupt?: (text: string) => void;

  // 主题 / 文字记录
  onTopicStart?: (type: 'lecture' | 'discussion', title: string) => void;
  onTopicAppend?: (role: string, text: string) => void;
  onTopicEnd?: () => void;

  // 进度追踪（用于持久化）
  onProgress?: (snapshot: PlaybackSnapshot) => void;

  /** 检查给定智能体是否在用户选择的列表中（用于跳过讨论动作） */
  isAgentSelected?: (agentId: string) => boolean;

  /** 获取当前播放速度倍率（例如 1、1.5、2） */
  getPlaybackSpeed?: () => number;

  onComplete?: () => void;
}
