'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { ScreenElement } from '@/components/slide-renderer/Editor/ScreenElement';
import { elementFingerprint } from '@/lib/utils/element-fingerprint';
import type { PPTElement } from '@/lib/types/slides';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * 动画元素包装器
 */
function AnimatedElement({
  element,
  index,
  isClearing,
  totalElements,
}: {
  element: PPTElement;
  index: number;
  isClearing: boolean;
  totalElements: number;
}) {
  // 反向交错：最后绘制的元素最先退出，形成"擦除"级联效果
  const clearDelay = isClearing ? (totalElements - 1 - index) * 0.055 : 0;
  // 交替倾斜方向，增加自然感
  const clearRotate = isClearing ? (index % 2 === 0 ? 1 : -1) * (2 + index * 0.4) : 0;

  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, scale: 0.92, y: 8, filter: 'blur(4px)' }}
      animate={
        isClearing
          ? {
              opacity: 0,
              scale: 0.35,
              y: -35,
              rotate: clearRotate,
              filter: 'blur(8px)',
              transition: {
                duration: 0.38,
                delay: clearDelay,
                ease: [0.5, 0, 1, 0.6],
              },
            }
          : {
              opacity: 1,
              scale: 1,
              y: 0,
              rotate: 0,
              filter: 'blur(0px)',
              transition: {
                duration: 0.45,
                ease: [0.16, 1, 0.3, 1],
                delay: index * 0.05,
              },
            }
      }
      exit={{
        opacity: 0,
        scale: 0.85,
        transition: { duration: 0.2 },
      }}
      className="absolute inset-0"
      style={{ pointerEvents: isClearing ? 'none' : undefined }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <ScreenElement elementInfo={element} elementIndex={index} animate />
      </div>
    </motion.div>
  );
}

/**
 * 白板画布 — 渲染当前白板元素并处理自动快照，
 * 以便用户可以浏览/恢复之前的状态。
 *
 * 自动快照逻辑监控"内容替换"事件 — 即 AI 用新元素替换白板内容时。
 * 它进行 2 秒防抖，以免逐个添加元素时刷屏历史存储。
 * `restoredKey` 一次性守卫防止恢复操作本身触发新快照。
 */
export function WhiteboardCanvas() {
  const { t } = useI18n();
  const stage = useStageStore.use.stage();
  const isClearing = useCanvasStore.use.whiteboardClearing();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // 获取白板元素
  const whiteboard = stage?.whiteboard?.[0];
  const rawElements = whiteboard?.elements;
  const elements = useMemo(() => rawElements ?? [], [rawElements]);

  // ── 自动快照逻辑 ──────────────────────────────────────────
  // 在元素稳定（未变化）2 秒后保存当前状态的快照。
  // 这确保完整的"完成"结果出现在历史中，而不仅仅是中间构建状态。
  const elementsKey = useMemo(() => elementFingerprint(elements), [elements]);
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 每当元素变化时取消任何待处理的计时器
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }

    // 不对空状态或清除动画期间进行快照
    if (elements.length === 0 || isClearing) return;

    // 如果此状态与刚恢复的快照匹配，则跳过并清除标志。
    // 此检查使用指纹比较（评审点 #5）而非脆弱的布尔标志，
    // 完全消除了时序依赖性。
    const { restoredKey } = useWhiteboardHistoryStore.getState();
    if (restoredKey && elementsKey === restoredKey) {
      useWhiteboardHistoryStore.getState().setRestoredKey(null);
      return;
    }

    snapshotTimerRef.current = setTimeout(() => {
      // 保存当前稳定状态（而非之前的状态）
      const current = elementsRef.current;
      if (current.length > 0) {
        useWhiteboardHistoryStore.getState().pushSnapshot(current);
      }
    }, 2000);

    return () => {
      if (snapshotTimerRef.current) {
        clearTimeout(snapshotTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementsKey, isClearing]);

  // ── 布局：白板固定尺寸 1000 x 562.5 (16:9) ─────────
  const canvasWidth = 1000;
  const canvasHeight = 562.5;

  const updateScale = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { clientWidth, clientHeight } = container;
    const scaleX = clientWidth / canvasWidth;
    const scaleY = clientHeight / canvasHeight;
    setScale(Math.min(scaleX, scaleY));
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    updateScale();
    return () => observer.disconnect();
  }, [updateScale]);

  // ── 渲染 ──────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden"
    >
      {/* 布局包装器：其尺寸与缩放后的视觉尺寸匹配，以便 flex 居中正常工作 */}
      <div style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
        <div
          className="relative bg-white shadow-2xl rounded-lg overflow-hidden"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {/* 空白且未在清除中时显示占位符 */}
          <AnimatePresence>
            {elements.length === 0 && !isClearing && (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { delay: 0.25, duration: 0.4 },
                }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="text-center text-gray-400">
                  <p className="text-lg font-medium">{t('whiteboard.ready')}</p>
                  <p className="text-sm mt-1">{t('whiteboard.readyHint')}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 元素 — 始终渲染以便 AnimatePresence 可以跟踪退出 */}
          <AnimatePresence mode="popLayout">
            {elements.map((element, index) => (
              <AnimatedElement
                key={element.id}
                element={element}
                index={index}
                isClearing={isClearing}
                totalElements={elements.length}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
