'use client';

import type { PPTElementOutline } from '@/lib/types/slides';
import { useElementOutline } from './hooks/useElementOutline';

export interface ElementOutlineProps {
  width: number;
  height: number;
  outline?: PPTElementOutline;
}

/**
 * 元素轮廓（边框）组件
 * 根据轮廓配置在元素周围渲染 SVG 轮廓
 */
export function ElementOutline({ width, height, outline }: ElementOutlineProps) {
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(outline);

  if (!outline) return null;

  return (
    <svg
      className="element-outline absolute top-0 left-0 overflow-visible"
      width={width}
      height={height}
    >
      <path
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeMiterlimit="8"
        fill="transparent"
        d={`M0,0 L${width},0 L${width},${height} L0,${height} Z`}
        stroke={outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
    </svg>
  );
}
