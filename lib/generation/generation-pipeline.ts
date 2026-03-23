/**
 * 两阶段生成流水线
 *
 * 桶重导出 — 之前从此文件导出的所有符号
 * 现在分散到专注的子模块中。
 */

// 类型
export type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  GenerationResult,
  GenerationCallbacks,
  AICallFn,
} from './pipeline-types';

// Prompt 格式化器
export {
  buildCourseContext,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
} from './prompt-formatters';

// JSON 修复
export { parseJsonResponse, tryParseJson } from './json-repair';

// 大纲生成器（阶段 1）
export { generateSceneOutlinesFromRequirements, applyOutlineFallbacks } from './outline-generator';

// 场景生成器（阶段 2）
export {
  generateFullScenes,
  generateSceneContent,
  generateSceneActions,
  createSceneWithActions,
} from './scene-generator';

// 场景构建器（独立）
export {
  buildSceneFromOutline,
  buildCompleteScene,
  uniquifyMediaElementIds,
} from './scene-builder';

// 流水线运行器
export { createGenerationSession, runGenerationPipeline } from './pipeline-runner';
