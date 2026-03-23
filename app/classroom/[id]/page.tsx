'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] 所有场景已生成');
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      // 如果 IndexedDB 没有数据，尝试服务器端存储（API 生成的课堂）
      if (!useStageStore.getState().stage) {
        log.info('IndexedDB 无数据，尝试服务器端存储：', classroomId);
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              log.info('从服务器端存储加载：', classroomId);
            }
          }
        } catch (fetchErr) {
          log.warn('服务器端存储获取失败：', fetchErr);
        }
      }

      // 从 IndexedDB 恢复已完成的媒体生成任务
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // 恢复此舞台的已生成智能体
      const { loadGeneratedAgentsForStage } = await import('@/lib/orchestration/registry/store');
      const agentIds = await loadGeneratedAgentsForStage(classroomId);
      if (agentIds.length > 0) {
        const { useSettingsStore } = await import('@/lib/store/settings');
        useSettingsStore.getState().setSelectedAgentIds(agentIds);
      }
    } catch (error) {
      log.error('加载课堂失败：', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    // 在切换课程时重置加载状态，以便在过渡期间卸载 Stage，
    // 防止过期数据同步回新课程
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;

    // 清除上一个课堂的媒体任务以防止跨课堂污染。
    // 占位符 ID（gen_img_1、gen_vid_1）在各舞台间并非全局唯一，
    // 因此上一个课堂的过期任务会覆盖新课堂的任务。
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // 清空白板历史以防止上一个课程的快照泄露进来。
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // 当 classroomId 变更或组件卸载时取消正在进行的生成
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // 自动恢复待处理大纲的生成
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // 检查是否有待处理的大纲
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // 从 sessionStorage 加载生成参数（由 generation-preview 在导航前存储）
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // 使用 pdfImages 的 storageId 从 IndexedDB 重建 imageMapping
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            language: stage.language,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // 所有场景已生成，但部分媒体可能尚未完成。
      // 恢复 IndexedDB 中尚未完成的任务的媒体生成。
      // generateMediaForOutlines 会自动跳过已完成的任务。
      generationStartedRef.current = true;
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] 媒体生成恢复错误：', err);
      });
    }
  }, [loading, error, generateRemaining]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
