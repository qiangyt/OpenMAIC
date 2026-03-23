/**
 * Prompt 系统 - 简化的 Prompt 管理
 *
 * 特性:
 * - 基于文件的 Prompt 存储，位于 templates/ 目录
 * - 通过 {{snippet:name}} 语法进行片段组合
 * - 通过 {{variable}} 语法进行变量插值
 */

// 类型
export type { PromptId, SnippetId, LoadedPrompt } from './types';

// 加载器函数
export {
  loadPrompt,
  loadSnippet,
  buildPrompt,
  interpolateVariables,
  clearPromptCache,
} from './loader';

// Prompt ID 常量
export const PROMPT_IDS = {
  REQUIREMENTS_TO_OUTLINES: 'requirements-to-outlines',
  SLIDE_CONTENT: 'slide-content',
  QUIZ_CONTENT: 'quiz-content',
  SLIDE_ACTIONS: 'slide-actions',
  QUIZ_ACTIONS: 'quiz-actions',
  INTERACTIVE_SCIENTIFIC_MODEL: 'interactive-scientific-model',
  INTERACTIVE_HTML: 'interactive-html',
  INTERACTIVE_ACTIONS: 'interactive-actions',
  PBL_ACTIONS: 'pbl-actions',
} as const;
