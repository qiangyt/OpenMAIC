/**
 * 生成类型 - 两阶段内容生成系统
 *
 * 第一阶段：用户需求 + 文档 → 场景大纲（每页）
 * 第二阶段：场景大纲 → 完整场景（幻灯片/测验/互动/项目式学习，包含动作）
 */

import type { ActionType } from './action';
import type { MediaGenerationRequest } from '@/lib/media/types';

// ==================== PDF 图像类型 ====================

/**
 * 从 PDF 中提取的图像及其元数据
 */
export interface PdfImage {
  id: string; // 例如 "img_1", "img_2"
  src: string; // base64 数据 URL（存储在 IndexedDB 时为空）
  pageNumber: number; // PDF 中的页码
  description?: string; // 可选描述，用于 AI 上下文
  storageId?: string; // IndexedDB 引用（session_xxx_img_1）
  width?: number; // 图像宽度（像素或标准化值）
  height?: number; // 图像高度（像素或标准化值）
}

/**
 * 后处理用的图像映射：image_id → base64 URL
 */
export type ImageMapping = Record<string, string>;

// ==================== 第一阶段输入 ====================

export interface AudienceProfile {
  gradeLevel: string; // "K-12"、"University"、"Professional"
  ageRange?: string; // "6-12"、"18-25"
  prerequisites?: string[]; // 必需的先修知识
  learningStyles?: ('visual' | 'auditory' | 'kinesthetic' | 'reading')[];
}

export interface StylePreferences {
  tone: 'formal' | 'casual' | 'engaging' | 'academic';
  visualStyle: 'minimalist' | 'colorful' | 'professional' | 'playful';
  interactivityLevel: 'low' | 'medium' | 'high';
  includeExamples: boolean;
  includePractice: boolean;
  language: string; // 'zh-CN'、'en-US'
}

export interface UploadedDocument {
  id: string;
  name: string; // 原始文件名
  type: 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'image' | 'other';
  size: number; // 字节数
  uploadedAt: Date;
  contentSummary?: string; // 解析占位符
  extractedTopics?: string[]; // 解析占位符
  pageCount?: number;
  storageRef?: string;
}

/**
 * 简化的用户需求，用于课程生成
 * 所有细节（主题、时长、风格等）应包含在需求文本中
 */
export interface UserRequirements {
  requirement: string; // 所有用户输入的单一自由文本
  language: 'zh-CN' | 'en-US'; // 课程语言 - 对生成至关重要
  userNickname?: string; // 学生昵称，用于个性化
  userBio?: string; // 学生背景，用于个性化
  webSearch?: boolean; // 启用网络搜索以获取更丰富的上下文
}

/**
 * @deprecated 请使用 UserRequirements 代替
 * 旧版结构化需求 - 保留以向后兼容
 */
export interface LegacyUserRequirements {
  topic: string;
  description?: string;
  learningObjectives: string[];
  audience: AudienceProfile;
  durationMinutes: number;
  style: StylePreferences;
  documents?: UploadedDocument[];
  additionalNotes?: string;
}

// ==================== 第一阶段输出：场景大纲（简化版） ====================

/**
 * 简化的场景大纲
 * 给 AI 更多自由度，只需意图描述和要点
 */
export interface SceneOutline {
  id: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  description: string; // 1-2 句话描述目的
  keyPoints: string[]; // 3-5 个核心要点
  teachingObjective?: string;
  estimatedDuration?: number; // 秒
  order: number;
  language?: 'zh-CN' | 'en-US'; // 生成语言（从需求继承）
  // 建议的图像 ID（从 PDF 提取的图像）
  suggestedImageIds?: string[]; // 例如 ["img_1", "img_3"]
  // AI 生成的媒体请求（当 PDF 图像不足时）
  mediaGenerations?: MediaGenerationRequest[]; // 例如 [{ type: 'image', prompt: '...', elementId: 'gen_img_1' }]
  // 测验专用配置
  quizConfig?: {
    questionCount: number;
    difficulty: 'easy' | 'medium' | 'hard';
    questionTypes: ('single' | 'multiple' | 'text')[];
  };
  // 互动专用配置
  interactiveConfig?: {
    conceptName: string;
    conceptOverview: string;
    designIdea: string;
    subject?: string;
  };
  // PBL 专用配置
  pblConfig?: {
    projectTopic: string;
    projectDescription: string;
    targetSkills: string[];
    issueCount?: number;
    language: 'zh-CN' | 'en-US';
  };
}

// ==================== 第三阶段输出：生成的内容 ====================

import type { PPTElement, SlideBackground } from './slides';
import type { QuizQuestion } from './stage';

/**
 * AI 生成的幻灯片内容
 */
export interface GeneratedSlideContent {
  elements: PPTElement[];
  background?: SlideBackground;
  remark?: string;
}

/**
 * AI 生成的测验内容
 */
export interface GeneratedQuizContent {
  questions: QuizQuestion[];
}

// ==================== PBL 生成类型 ====================

import type { PBLProjectConfig } from '@/lib/pbl/types';

/**
 * AI 生成的 PBL 内容
 */
export interface GeneratedPBLContent {
  projectConfig: PBLProjectConfig;
}

// ==================== 互动生成类型 ====================

/**
 * 科学建模阶段输出的科学模型
 */
export interface ScientificModel {
  core_formulas: string[];
  mechanism: string[];
  constraints: string[];
  forbidden_errors: string[];
}

/**
 * AI 生成的互动内容
 */
export interface GeneratedInteractiveContent {
  html: string;
  scientificModel?: ScientificModel;
}

// ==================== 旧版类型（用于兼容） ====================

export interface SuggestedSlideElement {
  type: 'text' | 'image' | 'shape' | 'chart' | 'latex' | 'line';
  purpose: 'title' | 'subtitle' | 'content' | 'example' | 'diagram' | 'formula' | 'highlight';
  contentHint: string;
  position?: 'top' | 'center' | 'bottom' | 'left' | 'right';
  chartType?: 'bar' | 'line' | 'pie' | 'radar';
  textOutline?: string[];
}

export interface SuggestedQuizQuestion {
  type: 'single' | 'multiple' | 'short_answer';
  questionOutline: string;
  suggestedOptions?: string[];
  targetConceptId?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SuggestedAction {
  type: ActionType;
  description: string;
  timing?: 'start' | 'middle' | 'end' | 'after-content';
}

// ==================== 生成会话 ====================

export interface GenerationProgress {
  currentStage: 1 | 2 | 3;
  overallProgress: number; // 0-100
  stageProgress: number; // 0-100
  statusMessage: string;
  scenesGenerated: number;
  totalScenes: number;
  errors?: string[];
}

export interface GenerationSession {
  id: string;
  requirements: UserRequirements;
  sceneOutlines?: SceneOutline[];
  progress: GenerationProgress;
  startedAt: Date;
  completedAt?: Date;
  generatedStageId?: string;
}
