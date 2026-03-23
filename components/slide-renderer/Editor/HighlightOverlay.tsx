'use client';

import { useMemo } from 'react';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement } from '@/lib/types/slides';

/**
 * 高亮覆盖层组件
 *
 * 功能：
 * - 在元素上方叠加高亮效果
 * - 不修改元素属性
 * - 支持同时高亮多个元素
 * - 支持动画效果（呼吸、闪烁等）
 *
 * 实现：
 * - 在元素位置创建覆盖层 div
 * - 使用 box-shadow 实现发光效果
 * - 使用 CSS 动画实现动画效果
 */
export function HighlightOverlay() {
  const highlightedElementIds = useCanvasStore.use.highlightedElementIds();
  const highlightOptions = useCanvasStore.use.highlightOptions();

  // 获取当前场景的元素列表
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );

  // 查找所有需要高亮的元素（排除线条元素，因为它们没有高度属性）
  const highlightedElements = useMemo(() => {
    if (!highlightedElementIds.length) return [];
    return elements.filter((el) => highlightedElementIds.includes(el.id) && el.type !== 'line');
  }, [elements, highlightedElementIds]);

  // 如果没有高亮元素则跳过渲染
  if (!highlightedElements.length || !highlightOptions) {
    return null;
  }

  const { color = '#ff6b6b', opacity = 0.3, borderWidth = 3, animated = true } = highlightOptions;

  return (
    <>
      {highlightedElements.map((element) => {
        // 类型守卫：线条元素已在上方过滤掉
        // 使用 'in' 运算符进行运行时检查以满足 TypeScript 要求
        const height = 'height' in element ? element.height : 0;
        const rotate = 'rotate' in element ? element.rotate : 0;
        return (
          <div
            key={element.id}
            className="highlight-overlay absolute pointer-events-none"
            style={{
              left: `${element.left}px`,
              top: `${element.top}px`,
              width: `${element.width}px`,
              height: `${height}px`,
              transform: `rotate(${rotate || 0}deg)`,
              transformOrigin: 'center',
              zIndex: 999,
              transition: 'all 0.3s ease-in-out',
            }}
          >
            {/* 高亮边框 */}
            <div
              className={`absolute inset-0 rounded ${animated ? 'animate-pulse' : ''}`}
              style={{
                border: `${borderWidth}px solid ${color}`,
                boxShadow: `
                0 0 ${borderWidth * 3}px ${color},
                inset 0 0 ${borderWidth * 2}px rgba(255,255,255,${opacity * 0.5})
              `,
                backgroundColor: `${color}${Math.round(opacity * 255)
                  .toString(16)
                  .padStart(2, '0')}`,
              }}
            />

            {/* 发光效果 */}
            {animated && (
              <div
                className="absolute inset-0 rounded animate-ping"
                style={{
                  border: `${borderWidth}px solid ${color}`,
                  opacity: 0.5,
                  animationDuration: '2s',
                }}
              />
            )}
          </div>
        );
      })}

      {/* CSS 动画（呼吸灯效果） */}
      <style jsx>{`
        @keyframes breathe {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        .highlight-overlay.animate-pulse {
          animation: breathe 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
