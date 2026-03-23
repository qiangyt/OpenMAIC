import { create } from 'zustand';
import type { IndexableTypeArray } from 'dexie';
import { db, type Snapshot } from '@/lib/utils/database';
import { useStageStore } from './stage';
import type { Scene } from '@/lib/types/stage';

export interface SnapshotState {
  // 状态
  snapshotCursor: number; // 快照指针
  snapshotLength: number; // 快照数量

  // 计算属性
  canUndo: () => boolean;
  canRedo: () => boolean;

  // 操作
  setSnapshotCursor: (cursor: number) => void;
  setSnapshotLength: (length: number) => void;
  initSnapshotDatabase: () => Promise<void>;
  addSnapshot: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/**
 * 快照 Store，用于撤销/重做功能
 * 基于 PPTist 的快照 Store，迁移到 Zustand
 *
 * 使用 IndexedDB（通过 Dexie）存储快照历史
 */
export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  // 初始状态
  snapshotCursor: -1,
  snapshotLength: 0,

  // 计算属性
  canUndo: () => get().snapshotCursor > 0,
  canRedo: () => get().snapshotCursor < get().snapshotLength - 1,

  // 操作
  setSnapshotCursor: (cursor: number) => set({ snapshotCursor: cursor }),
  setSnapshotLength: (length: number) => set({ snapshotLength: length }),

  /**
   * 用当前状态初始化快照数据库
   */
  initSnapshotDatabase: async () => {
    const stageStore = useStageStore.getState();

    const newFirstSnapshot = {
      index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
      slides: JSON.parse(JSON.stringify(stageStore.scenes)),
    };
    await db.snapshots.add(newFirstSnapshot);

    set({
      snapshotCursor: 0,
      snapshotLength: 1,
    });
  },

  /**
   * 向历史记录添加新快照
   * 处理快照长度限制和指针位置
   */
  addSnapshot: async () => {
    const stageStore = useStageStore.getState();
    const { snapshotCursor } = get();

    // 从 IndexedDB 获取所有快照 ID
    const allKeys = await db.snapshots.orderBy('id').keys();

    let needDeleteKeys: IndexableTypeArray = [];

    // 如果指针不在末尾，删除指针后的所有快照
    // 这发生在用户多次撤销后执行新操作时
    if (snapshotCursor >= 0 && snapshotCursor < allKeys.length - 1) {
      needDeleteKeys = allKeys.slice(snapshotCursor + 1);
    }

    // 添加新快照
    const snapshot = {
      index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
      slides: JSON.parse(JSON.stringify(stageStore.scenes)),
    };
    await db.snapshots.add(snapshot);

    // 计算新的快照长度
    let snapshotLength = allKeys.length - needDeleteKeys.length + 1;

    // 执行快照长度限制
    const snapshotLengthLimit = 20;
    if (snapshotLength > snapshotLengthLimit) {
      needDeleteKeys.push(allKeys[0]);
      snapshotLength--;
    }

    // 撤销后保持页面焦点：将倒数第二个快照的索引设置为当前场景
    // https://github.com/pipipi-pikachu/PPTist/issues/27
    if (snapshotLength >= 2) {
      const currentSceneIndex = stageStore.getSceneIndex(stageStore.currentSceneId || '');
      await db.snapshots.update(allKeys[snapshotLength - 2] as number, {
        index: currentSceneIndex,
      });
    }

    // 删除过时的快照
    await db.snapshots.bulkDelete(needDeleteKeys as number[]);

    set({
      snapshotCursor: snapshotLength - 1,
      snapshotLength,
    });
  },

  /**
   * 撤销：恢复上一个快照
   */
  undo: async () => {
    const { snapshotCursor } = get();
    if (snapshotCursor <= 0) return;

    const stageStore = useStageStore.getState();

    const newSnapshotCursor = snapshotCursor - 1;
    const snapshots: Snapshot[] = await db.snapshots.orderBy('id').toArray();
    const snapshot = snapshots[newSnapshotCursor];
    const { index, slides } = snapshot;

    const sceneIndex = index > slides.length - 1 ? slides.length - 1 : index;

    // Restore scenes and current scene
    stageStore.setScenes(slides as unknown as Scene[]); // Type assertion needed due to Slide vs Scene difference
    if (slides[sceneIndex]) {
      stageStore.setCurrentSceneId(slides[sceneIndex].id);
    }

    set({ snapshotCursor: newSnapshotCursor });
  },

  /**
   * 重做：恢复下一个快照
   */
  redo: async () => {
    const { snapshotCursor, snapshotLength } = get();
    if (snapshotCursor >= snapshotLength - 1) return;

    const stageStore = useStageStore.getState();

    const newSnapshotCursor = snapshotCursor + 1;
    const snapshots: Snapshot[] = await db.snapshots.orderBy('id').toArray();
    const snapshot = snapshots[newSnapshotCursor];
    const { index, slides } = snapshot;

    const sceneIndex = index > slides.length - 1 ? slides.length - 1 : index;

    // Restore scenes and current scene
    stageStore.setScenes(slides as unknown as Scene[]); // Type assertion needed due to Slide vs Scene difference
    if (slides[sceneIndex]) {
      stageStore.setCurrentSceneId(slides[sceneIndex].id);
    }

    set({ snapshotCursor: newSnapshotCursor });
  },
}));
