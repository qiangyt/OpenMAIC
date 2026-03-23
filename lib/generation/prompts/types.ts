/**
 * 简化的 Prompt 系统类型定义
 */

/**
 * Prompt 模板标识符
 */
export type PromptId =
  | 'requirements-to-outlines'
  | 'slide-content'
  | 'quiz-content'
  | 'slide-actions'
  | 'quiz-actions'
  | 'interactive-scientific-model'
  | 'interactive-html'
  | 'interactive-actions'
  | 'pbl-actions';

/**
 * 片段标识符
 */
export type SnippetId = 'json-output-rules' | 'element-types' | 'action-types';

/**
 * 已加载的 Prompt 模板
 */
export interface LoadedPrompt {
  id: PromptId;
  systemPrompt: string;
  userPromptTemplate: string;
}
