'use client';

import type { PPTElementOutline } from '@/lib/types/slides';
import { useElementOutline } from '../../hooks/useElementOutline';

export interface ImageRectOutlineProps {
  width: number;
  height: number;
  outline?: PPTElementOutline;
  radius?: string;
}

/**
 * 图片元素的矩形边框
 */
export function ImageRectOutline({ width, height, outline, radius = '0' }: ImageRectOutlineProps) {
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(outline);

  if (!outline) return null;

  return (
    <svg className="absolute top-0 left-0 z-[2] overflow-visible" width={width} height={height}>
      <rect
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeMiterlimit="8"
        fill="transparent"
        rx={radius}
        ry={radius}
        width={width}
        height={height}
        stroke={outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
    </svg>
  );
}
