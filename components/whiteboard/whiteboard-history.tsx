'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { createStageAPI } from '@/lib/api/stage-api';
import { elementFingerprint } from '@/lib/utils/element-fingerprint';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';

interface WhiteboardHistoryProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * 白板历史下拉面板。
 * 显示保存的白板快照列表，包含时间戳和元素数量。
 * 点击"恢复"将当前白板内容替换为快照内容。
 */
export function WhiteboardHistory({ isOpen, onClose }: WhiteboardHistoryProps) {
  const { t } = useI18n();
  const snapshots = useWhiteboardHistoryStore((s) => s.snapshots);
  const isClearing = useCanvasStore.use.whiteboardClearing();
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟添加监听器，以免打开面板的点击立即关闭它
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, onClose]);

  const handleRestore = (index: number) => {
    // P1：清除动画进行时阻止恢复 — 待处理的删除/更新会立即覆盖恢复的内容。
    if (isClearing) {
      toast.error(t('whiteboard.restoreError'));
      return;
    }

    const snapshot = useWhiteboardHistoryStore.getState().getSnapshot(index);
    if (!snapshot) return;

    const stageStore = useStageStore;
    const stageAPI = createStageAPI(stageStore);

    // 获取或创建白板
    const wbResult = stageAPI.whiteboard.get();
    if (!wbResult.success || !wbResult.data) {
      return;
    }
    const whiteboardId = wbResult.data.id;

    // P2a：跳过无操作恢复 — 如果快照与当前屏幕内容匹配，应用它不会改变 elementsKey，
    // 导致 restoredKey 无限期保持激活状态，从而抑制未来的快照。
    const restoredElementsKey = snapshot.fingerprint;
    const currentKey = elementFingerprint(wbResult.data.elements ?? []);
    if (restoredElementsKey === currentKey) {
      toast.success(t('whiteboard.restored'));
      onClose();
      return;
    }

    // 设置 restoredKey，以便自动快照跳过即将到来的变更
    useWhiteboardHistoryStore.getState().setRestoredKey(restoredElementsKey);

    // 事务性恢复：在一次 update() 调用中替换所有元素，
    // 而不是循环删除/添加，后者会产生中间状态。
    const result = stageAPI.whiteboard.update({ elements: snapshot.elements }, whiteboardId);

    if (!result.success) {
      // 恢复失败 — 清除 restoredKey，以免自动快照卡住
      useWhiteboardHistoryStore.getState().setRestoredKey(null);
      console.error('Failed to restore whiteboard snapshot:', result.error);
      // P3：专用的 restoreError 键（不是 clearError）
      toast.error(t('whiteboard.restoreError') + (result.error ?? ''));
      return;
    }

    toast.success(t('whiteboard.restored'));
    onClose();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="absolute top-14 right-4 z-[130] w-72 max-h-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
        >
          {/* 头部 */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {t('whiteboard.history')}
            </span>
            <span className="text-xs text-gray-400">
              {snapshots.length > 0 ? `${snapshots.length}` : ''}
            </span>
          </div>

          {/* 快照列表 */}
          <div className="flex-1 overflow-y-auto">
            {snapshots.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                {t('whiteboard.noHistory')}
              </div>
            ) : (
              <div className="py-1">
                {[...snapshots].reverse().map((snap, reverseIdx) => {
                  const realIdx = snapshots.length - 1 - reverseIdx;
                  return (
                    <div
                      key={`${snap.timestamp}-${realIdx}`}
                      className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                          {snap.label || `#${realIdx + 1}`}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {formatTime(snap.timestamp)} ·{' '}
                          {t('whiteboard.elementCount').replace(
                            '{count}',
                            String(snap.elements.length),
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestore(realIdx)}
                        disabled={isClearing}
                        className="ml-2 px-2 py-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t('whiteboard.restore')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
