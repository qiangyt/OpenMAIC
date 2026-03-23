/**
 * 白板历史记录 Store
 *
 * 轻量级内存存储，在破坏性操作（清除、替换）之前
 * 保存白板元素的快照。允许用户浏览和恢复之前的白板状态。
 *
 * 历史记录是会话级别的（不持久化到 IndexedDB），以保持简单。
 */

import { create } from 'zustand';
import type { PPTElement } from '@/lib/types/slides';
import { elementFingerprint } from '@/lib/utils/element-fingerprint';

export interface WhiteboardSnapshot {
  /** 捕获时白板元素的深拷贝 */
  elements: PPTElement[];
  /** 快照拍摄的时间戳 */
  timestamp: number;
  /** 在历史面板中显示的可读标签 */
  label?: string;
  /** 缓存的指纹，用于去重和空操作恢复检查 */
  fingerprint: string;
}

interface WhiteboardHistoryState {
  /** 快照栈，最新的在最后 */
  snapshots: WhiteboardSnapshot[];
  /** 保留的最大快照数量 */
  maxSnapshots: number;
  /** 刚恢复的快照的 elementsKey；用于跳过一次自动快照 */
  restoredKey: string | null;

  // 操作
  /** 保存当前白板元素的快照 */
  pushSnapshot: (elements: PPTElement[], label?: string) => void;
  /** 根据索引获取快照 */
  getSnapshot: (index: number) => WhiteboardSnapshot | null;
  /** 清除所有历史 */
  clearHistory: () => void;
  /** 设置恢复的键（正在恢复的快照的 elementsKey） */
  setRestoredKey: (key: string | null) => void;
}

export const useWhiteboardHistoryStore = create<WhiteboardHistoryState>((set, get) => ({
  snapshots: [],
  maxSnapshots: 20,
  restoredKey: null,

  pushSnapshot: (elements, label) => {
    // 不保存空快照
    if (!elements || elements.length === 0) return;

    const { snapshots } = get();
    const newFingerprint = elementFingerprint(elements);
    if (snapshots.length > 0 && snapshots[snapshots.length - 1].fingerprint === newFingerprint) {
      return;
    }

    const snapshot: WhiteboardSnapshot = {
      elements: JSON.parse(JSON.stringify(elements)), // 深拷贝
      timestamp: Date.now(),
      label,
      fingerprint: newFingerprint,
    };

    set((state) => {
      const newSnapshots = [...state.snapshots, snapshot];
      // 执行限制：先丢弃最旧的快照。
      if (newSnapshots.length > state.maxSnapshots) {
        return { snapshots: newSnapshots.slice(-state.maxSnapshots) };
      }
      return { snapshots: newSnapshots };
    });
  },

  getSnapshot: (index) => {
    const { snapshots } = get();
    return snapshots[index] ?? null;
  },

  clearHistory: () => set({ snapshots: [], restoredKey: null }),
  setRestoredKey: (key) => set({ restoredKey: key }),
}));
