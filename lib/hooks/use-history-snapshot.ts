import { useCallback } from 'react';
import { useSnapshotStore } from '@/lib/store/snapshot';

/**
 * 管理历史快照的 Hook（撤销/重做）
 *
 * 用法：
 * ```tsx
 * const { addHistorySnapshot, canUndo, canRedo, undo, redo } = useHistorySnapshot();
 *
 * // 进行更改后
 * await addHistorySnapshot();
 *
 * // 撤销/重做
 * if (canUndo) await undo();
 * if (canRedo) await redo();
 * ```
 */
export function useHistorySnapshot() {
  const addSnapshot = useSnapshotStore((state) => state.addSnapshot);
  const undo = useSnapshotStore((state) => state.undo);
  const redo = useSnapshotStore((state) => state.redo);
  const canUndo = useSnapshotStore((state) => state.canUndo);
  const canRedo = useSnapshotStore((state) => state.canRedo);

  /**
   * 向历史记录添加快照
   * 在任何应可撤销的重要状态更改后调用
   */
  const addHistorySnapshot = useCallback(async () => {
    await addSnapshot();
  }, [addSnapshot]);

  return {
    addHistorySnapshot,
    undo,
    redo,
    canUndo: canUndo(),
    canRedo: canRedo(),
  };
}
