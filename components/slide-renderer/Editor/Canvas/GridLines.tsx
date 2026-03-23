import { useMemo } from 'react';
import { useCanvasStore, useSceneSelector } from '@/lib/store';
import type { SlideContent } from '@/lib/types/stage';
import type { SlideBackground } from '@/lib/types/slides';

export function GridLines() {
  const gridLineSize = useCanvasStore.use.gridLineSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();
  const viewportSize = useCanvasStore.use.viewportSize();

  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );

  // 计算网格线颜色以避免与背景混合
  const gridColor = useMemo(() => {
    const bgColor = background?.color || '#fff';
    // 简化版本：根据背景亮度选择黑色或白色
    const isLight = bgColor === '#fff' || bgColor.startsWith('#f') || bgColor.startsWith('#e');
    const baseColor = isLight ? '0, 0, 0' : '255, 255, 255';
    return `rgba(${baseColor}, 0.5)`;
  }, [background]);

  // 网格路径
  const path = useMemo(() => {
    const maxX = viewportSize;
    const maxY = viewportSize * viewportRatio;

    let p = '';
    for (let i = 0; i <= Math.floor(maxY / gridLineSize); i++) {
      p += `M0 ${i * gridLineSize} L${maxX} ${i * gridLineSize} `;
    }
    for (let i = 0; i <= Math.floor(maxX / gridLineSize); i++) {
      p += `M${i * gridLineSize} 0 L${i * gridLineSize} ${maxY} `;
    }
    return p;
  }, [viewportSize, viewportRatio, gridLineSize]);

  return (
    <svg
      className="grid-lines absolute inset-0 pointer-events-none z-40"
      width={viewportSize}
      height={viewportSize * viewportRatio}
      viewBox={`0 0 ${viewportSize} ${viewportSize * viewportRatio}`}
    >
      <path d={path} fill="none" stroke={gridColor} strokeWidth="1" strokeDasharray="5 5" />
    </svg>
  );
}
