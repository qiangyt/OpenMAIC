import { useMemo } from 'react';
import type { PPTShapeElement } from '@/lib/types/slides';

/**
 * 计算元素填充样式
 * 返回图案/渐变 URL 或纯色填充
 * @param element 形状元素
 * @param source 图案/渐变 ID 的来源标识符
 */
export function useElementFill(element: PPTShapeElement, source: string) {
  const fill = useMemo(() => {
    if (element.pattern) return `url(#${source}-pattern-${element.id})`;
    if (element.gradient) return `url(#${source}-gradient-${element.id})`;
    return element.fill || 'none';
  }, [element.pattern, element.gradient, element.fill, element.id, source]);

  return {
    fill,
  };
}
