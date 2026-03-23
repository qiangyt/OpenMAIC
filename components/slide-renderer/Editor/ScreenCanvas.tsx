'use client';

import { ScreenElement } from './ScreenElement';
import { HighlightOverlay } from './HighlightOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { findElementGeometry } from '@/lib/utils/geometry';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';
import { useViewportSize } from './Canvas/hooks/useViewportSize';
import { useRef, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';

export function ScreenCanvas() {
  const canvasScale = useCanvasStore.use.canvasScale();
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );
  const canvasRef = useRef<HTMLDivElement>(null);

  // 视口尺寸和定位
  const { viewportStyles } = useViewportSize(canvasRef);

  // 获取背景样式
  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );
  const { backgroundStyle } = useSlideBackgroundStyle(background);

  // 获取视觉效果状态
  const laserElementId = useCanvasStore.use.laserElementId();
  const laserOptions = useCanvasStore.use.laserOptions();
  const zoomTarget = useCanvasStore.use.zoomTarget();

  // 计算激光笔几何位置
  const laserGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!laserElementId) return null;
    const element = elements.find((el) => el.id === laserElementId);
    if (!element) return null;
    return findElementGeometry(
      { type: 'slide', content: { canvas: { elements } } } as Record<string, unknown>,
      laserElementId,
    );
  }, [laserElementId, elements]);

  // 计算缩放目标几何位置
  const zoomGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!zoomTarget) return null;
    const element = elements.find((el) => el.id === zoomTarget.elementId);
    if (!element) return null;
    return findElementGeometry(
      { type: 'slide', content: { canvas: { elements } } } as Record<string, unknown>,
      zoomTarget.elementId,
    );
  }, [zoomTarget, elements]);

  return (
    <div className="relative h-full w-full overflow-hidden select-none" ref={canvasRef}>
      <div
        className="absolute shadow-[0_0_0_1px_rgba(0,0,0,0.01),0_0_12px_0_rgba(0,0,0,0.1)] rounded-lg overflow-hidden transition-transform duration-700"
        style={{
          width: `${viewportStyles.width * canvasScale}px`,
          height: `${viewportStyles.height * canvasScale}px`,
          left: `${viewportStyles.left}px`,
          top: `${viewportStyles.top}px`,
          ...(zoomTarget && zoomGeometry
            ? {
                transform: `scale(${zoomTarget.scale})`,
                transformOrigin: `${zoomGeometry.centerX}% ${zoomGeometry.centerY}%`,
              }
            : {}),
        }}
      >
        {/* 背景层 */}
        <div
          className="w-full h-full bg-position-center rounded-lg"
          style={{ ...backgroundStyle }}
        ></div>

        {/* 内容层 - 已缩放 */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: `${viewportStyles.width}px`,
            height: `${viewportStyles.height}px`,
            transform: `scale(${canvasScale})`,
          }}
        >
          {elements.map((element, index) => (
            <ScreenElement key={element.id} elementInfo={element} elementIndex={index + 1} />
          ))}

          {/* 高亮覆盖层 - 叠加在元素之上 */}
          <HighlightOverlay />
        </div>

        {/* 聚光灯覆盖层 - 覆盖整个幻灯片，通过 DOM 测量定位 */}
        <SpotlightOverlay />

        {/* 视觉效果层 - 位于缩放层外部，使用百分比坐标 */}
        <div className="absolute inset-0 pointer-events-none" style={{ padding: '5%' }}>
          <div className="relative w-full h-full">
            {/* 激光笔覆盖层 */}
            <AnimatePresence>
              {laserElementId && laserGeometry && (
                <LaserOverlay
                  key={`laser-${laserElementId}`}
                  geometry={laserGeometry}
                  color={laserOptions?.color}
                  duration={laserOptions?.duration}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
