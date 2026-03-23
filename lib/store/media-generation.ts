/**
 * 媒体生成 Store
 *
 * 跟踪每个元素的媒体生成状态（pending → generating → done/failed）。
 * 驱动幻灯片渲染器组件中的骨架屏加载。
 * 持久化由 IndexedDB（mediaFiles 表）处理，而非 Zustand 中间件。
 */

import { create } from 'zustand';
import type { MediaGenerationRequest } from '@/lib/media/types';
import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaGenerationStore');

// ==================== 类型 ====================

export type MediaTaskStatus = 'pending' | 'generating' | 'done' | 'failed';

export interface MediaTask {
  elementId: string;
  type: 'image' | 'video';
  status: MediaTaskStatus;
  prompt: string;
  params: {
    aspectRatio?: string;
    style?: string;
    duration?: number;
  };
  objectUrl?: string; // URL.createObjectURL() 用于渲染
  poster?: string; // 视频封面 objectUrl
  error?: string;
  errorCode?: string; // 结构化错误码（例如 'CONTENT_SENSITIVE'）
  retryCount: number;
  stageId: string;
}

interface MediaGenerationState {
  tasks: Record<string, MediaTask>;

  // 批量入队
  enqueueTasks: (stageId: string, requests: MediaGenerationRequest[]) => void;

  // 状态转换
  markGenerating: (elementId: string) => void;
  markDone: (elementId: string, objectUrl: string, poster?: string) => void;
  markFailed: (elementId: string, error: string, errorCode?: string) => void;

  // 重试支持
  markPendingForRetry: (elementId: string) => void;

  // 查询
  getTask: (elementId: string) => MediaTask | undefined;
  isReady: (elementId: string) => boolean;

  // 页面加载时从 IndexedDB 恢复
  restoreFromDB: (stageId: string) => Promise<void>;

  // 清理
  clearStage: (stageId: string) => void;
  revokeObjectUrls: () => void;
}

// ==================== 辅助函数 ====================

/** 检查 src 字符串是否为生成的媒体占位符 ID */
export function isMediaPlaceholder(src: string): boolean {
  return /^gen_(img|vid)_[\w-]+$/i.test(src);
}

// ==================== Store 实现 ====================

export const useMediaGenerationStore = create<MediaGenerationState>()((set, get) => ({
  tasks: {},

  enqueueTasks: (stageId, requests) => {
    const newTasks: Record<string, MediaTask> = {};
    for (const req of requests) {
      // 如果已跟踪则跳过
      if (get().tasks[req.elementId]) continue;
      newTasks[req.elementId] = {
        elementId: req.elementId,
        type: req.type,
        status: 'pending',
        prompt: req.prompt,
        params: {
          aspectRatio: req.aspectRatio,
          style: req.style,
        },
        retryCount: 0,
        stageId,
      };
    }
    if (Object.keys(newTasks).length > 0) {
      set((s) => ({ tasks: { ...s.tasks, ...newTasks } }));
    }
  },

  markGenerating: (elementId) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: { ...s.tasks, [elementId]: { ...task, status: 'generating' } },
      };
    }),

  markDone: (elementId, objectUrl, poster) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: {
            ...task,
            status: 'done',
            objectUrl,
            poster,
            error: undefined,
          },
        },
      };
    }),

  markFailed: (elementId, error, errorCode) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: { ...task, status: 'failed', error, errorCode },
        },
      };
    }),

  markPendingForRetry: (elementId) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: {
            ...task,
            status: 'pending',
            error: undefined,
            errorCode: undefined,
            retryCount: task.retryCount + 1,
          },
        },
      };
    }),

  getTask: (elementId) => get().tasks[elementId],

  isReady: (elementId) => get().tasks[elementId]?.status === 'done',

  restoreFromDB: async (stageId) => {
    try {
      const records = await db.mediaFiles.where('stageId').equals(stageId).toArray();
      const restored: Record<string, MediaTask> = {};
      for (const rec of records) {
        // 从复合键（stageId:elementId）中提取 elementId
        const elementId = rec.id.includes(':') ? rec.id.split(':').slice(1).join(':') : rec.id;
        const params = JSON.parse(rec.params || '{}');

        if (rec.error) {
          // 恢复为失败任务（持久化的不可重试错误）
          restored[elementId] = {
            elementId,
            type: rec.type,
            status: 'failed',
            prompt: rec.prompt,
            params,
            error: rec.error,
            errorCode: rec.errorCode,
            retryCount: 0,
            stageId,
          };
        } else {
          // 用存储的 mimeType 重新包装 blob — IndexedDB 可能会丢失 Blob.type
          const blob = rec.blob.type ? rec.blob : new Blob([rec.blob], { type: rec.mimeType });
          const objectUrl = URL.createObjectURL(blob);
          const poster = rec.poster ? URL.createObjectURL(rec.poster) : undefined;
          restored[elementId] = {
            elementId,
            type: rec.type,
            status: 'done',
            prompt: rec.prompt,
            params,
            objectUrl,
            poster,
            retryCount: 0,
            stageId,
          };
        }
      }
      if (Object.keys(restored).length > 0) {
        set((s) => ({ tasks: { ...s.tasks, ...restored } }));
      }
    } catch (err) {
      log.error('Failed to restore from DB:', err);
    }
  },

  clearStage: (stageId) =>
    set((s) => {
      const remaining: Record<string, MediaTask> = {};
      for (const [id, task] of Object.entries(s.tasks)) {
        if (task.stageId !== stageId) {
          remaining[id] = task;
        } else if (task.objectUrl) {
          URL.revokeObjectURL(task.objectUrl);
          if (task.poster) URL.revokeObjectURL(task.poster);
        }
      }
      return { tasks: remaining };
    }),

  revokeObjectUrls: () => {
    const tasks = get().tasks;
    for (const task of Object.values(tasks)) {
      if (task.objectUrl) URL.revokeObjectURL(task.objectUrl);
      if (task.poster) URL.revokeObjectURL(task.poster);
    }
  },
}));
