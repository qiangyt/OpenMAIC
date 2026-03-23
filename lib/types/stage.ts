// 舞台和场景数据类型
import type { Slide } from '@/lib/types/slides';
import type { Action } from '@/lib/types/action';
import type { PBLProjectConfig } from '@/lib/pbl/types';

export type SceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';

export type StageMode = 'autonomous' | 'playback';

export type Whiteboard = Omit<Slide, 'theme' | 'turningMode' | 'sectionTag' | 'type'>;

/**
 * 舞台 - 表示整个课堂/课程
 */
export interface Stage {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  // 舞台元数据
  language?: string;
  style?: string;
  // 白板数据
  whiteboard?: Whiteboard[];
}

/**
 * 场景 - 表示课程中的单个页面/场景
 */
export interface Scene {
  id: string;
  stageId: string; // 父舞台 ID（用于数据完整性检查）
  type: SceneType;
  title: string;
  order: number; // 显示顺序

  // 特定类型的内容
  content: SceneContent;

  // 回放期间执行的动作
  actions?: Action[];

  // 用于深入讲解的白板
  whiteboards?: Slide[];

  // 多智能体讨论配置
  multiAgent?: {
    enabled: boolean; // 为此场景启用多智能体
    agentIds: string[]; // 要包含的智能体（来自注册表）
    directorPrompt?: string; // 可选的自定义导演指令
  };

  // 元数据
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 基于类型的场景内容
 */
export type SceneContent = SlideContent | QuizContent | InteractiveContent | PBLContent;

/**
 * 幻灯片内容 - PPTist 画布数据
 */
export interface SlideContent {
  type: 'slide';
  // PPTist 幻灯片数据结构
  canvas: Slide;
}

/**
 * 测验内容 - React 组件属性/数据
 */
export interface QuizContent {
  type: 'quiz';
  questions: QuizQuestion[];
}

export interface QuizOption {
  label: string; // 显示文本
  value: string; // 选择键："A"、"B"、"C"、"D"
}

export interface QuizQuestion {
  id: string;
  type: 'single' | 'multiple' | 'short_answer';
  question: string;
  options?: QuizOption[];
  answer?: string[]; // 正确答案值：["A"]、["A","C"]，或文本题时为 undefined
  analysis?: string; // 评分后显示的解释
  commentPrompt?: string; // 文本题的评分指导
  hasAnswer?: boolean; // 是否可以自动评分
  points?: number; // 每题分数（默认 1）
}

/**
 * 互动内容 - 互动网页（iframe）
 */
export interface InteractiveContent {
  type: 'interactive';
  url: string; // 互动页面的 URL
  // 可选：嵌入的 HTML 内容
  html?: string;
}

/**
 * PBL 内容 - 项目式学习
 */
export interface PBLContent {
  type: 'pbl';
  projectConfig: PBLProjectConfig;
}

// 为方便使用，重新导出生成类型
export type {
  UserRequirements,
  SceneOutline,
  GenerationSession,
  GenerationProgress,
  UploadedDocument,
} from './generation';
