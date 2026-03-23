'use client';

import type { AlignmentLineProps } from '@/lib/types/edit';

export interface AlignmentLineComponentProps extends AlignmentLineProps {
  canvasScale: number;
}

/**
 * 对齐线组件
 * 在元素拖拽时显示视觉对齐参考线
 */
export function AlignmentLine({ type, axis, length, canvasScale }: AlignmentLineComponentProps) {
  // 对齐线位置
  const left = axis.x * canvasScale;
  const top = axis.y * canvasScale;

  // 对齐线长度
  const sizeStyle =
    type === 'vertical'
      ? { height: `${length * canvasScale}px` }
      : { width: `${length * canvasScale}px` };

  return (
    <div
      className="alignment-line absolute z-42"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      <div
        className={`line ${type === 'vertical' ? 'border-l border-dashed border-primary -translate-x-0.5' : 'border-t border-dashed border-primary -translate-y-0.5'}`}
        style={sizeStyle}
      />
    </div>
  );
}
