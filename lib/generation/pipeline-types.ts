/**
 * 生成流水线的类型定义。
 */

import type { GenerationProgress } from '@/lib/types/generation';

// ==================== 智能体信息 ====================

/** 传递给生成流水线的轻量级智能体信息 */
export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

// ==================== 跨页面上下文 ====================

/** 跨页面上下文，用于在场景间保持语音连贯性 */
export interface SceneGenerationContext {
  pageIndex: number; // 当前页码（从1开始）
  totalPages: number; // 总页数
  allTitles: string[]; // 按顺序排列的所有页面标题
  previousSpeeches: string[]; // 上一页的语音文本
}

// ==================== 生成的幻灯片数据接口 ====================

/**
 * AI 生成的幻灯片数据结构
 * 用于解析 AI 响应
 */
export interface GeneratedSlideData {
  elements: Array<{
    type: 'text' | 'image' | 'video' | 'shape' | 'chart' | 'latex' | 'line';
    left: number;
    top: number;
    width: number;
    height: number;
    [key: string]: unknown;
  }>;
  background?: {
    type: 'solid' | 'gradient';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      colors: Array<{ pos: number; color: string }>;
      rotate: number;
    };
  };
  remark?: string;
}

// ==================== 类型 ====================

export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  onStageComplete?: (stage: 1 | 2 | 3, result: unknown) => void;
  onError?: (error: string) => void;
}

export type AICallFn = (
  systemPrompt: string,
  userPrompt: string,
  images?: Array<{ id: string; src: string }>,
) => Promise<string>;
