/**
 * 顶层流水线编排。
 * 创建会话并运行完整的生成流水线。
 */

import { nanoid } from 'nanoid';
import type { UserRequirements, GenerationSession } from '@/lib/types/generation';
import type { StageStore } from '@/lib/api/stage-api';
import { generateSceneOutlinesFromRequirements } from './outline-generator';
import { generateFullScenes } from './scene-generator';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';

export function createGenerationSession(requirements: UserRequirements): GenerationSession {
  return {
    id: nanoid(),
    requirements,
    progress: {
      currentStage: 1,
      overallProgress: 0,
      stageProgress: 0,
      statusMessage: '初始化中...',
      scenesGenerated: 0,
      totalScenes: 0,
    },
    startedAt: new Date(),
  };
}

// 用于完整测试
export async function runGenerationPipeline(
  session: GenerationSession,
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<GenerationSession>> {
  try {
    // 阶段 1: 从需求生成场景大纲
    callbacks?.onProgress?.({
      ...session.progress,
      currentStage: 1,
      overallProgress: 5,
      statusMessage: '正在分析需求，生成场景大纲...',
    });

    const outlinesResult = await generateSceneOutlinesFromRequirements(
      session.requirements,
      undefined, // 此流程中无 PDF 文本
      undefined, // 此流程中无 PDF 图片
      aiCall,
      callbacks,
    );
    if (!outlinesResult.success || !outlinesResult.data) {
      throw new Error(outlinesResult.error || 'Failed to generate scene outlines');
    }
    session.sceneOutlines = outlinesResult.data;
    callbacks?.onStageComplete?.(1, session.sceneOutlines);

    // 阶段 2: 生成完整场景
    callbacks?.onProgress?.({
      ...session.progress,
      currentStage: 2,
      overallProgress: 50,
      statusMessage: '正在生成场景内容...',
      totalScenes: session.sceneOutlines.length,
    });

    const scenesResult = await generateFullScenes(session.sceneOutlines, store, aiCall, callbacks);
    if (!scenesResult.success) {
      throw new Error(scenesResult.error || 'Failed to generate scenes');
    }
    callbacks?.onStageComplete?.(2, scenesResult.data);

    // 完成
    session.completedAt = new Date();
    session.progress = {
      currentStage: 2,
      overallProgress: 100,
      stageProgress: 100,
      statusMessage: '生成完成！',
      scenesGenerated: scenesResult.data?.length || 0,
      totalScenes: session.sceneOutlines.length,
    };

    return { success: true, data: session };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errorMessage);
    session.progress.errors = [...(session.progress.errors || []), errorMessage];
    return { success: false, error: errorMessage };
  }
}
