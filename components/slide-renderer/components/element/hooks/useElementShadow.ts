import { useMemo } from 'react';
import type { PPTElementShadow } from '@/lib/types/slides';

/**
 * 计算元素阴影样式
 * 将阴影对象转换为 CSS box-shadow 字符串
 * @param shadow 阴影配置
 */
export function useElementShadow(shadow?: PPTElementShadow) {
  const shadowStyle = useMemo(() => {
    if (shadow) {
      const { h, v, blur, color } = shadow;
      return `${h}px ${v}px ${blur}px ${color}`;
    }
    return '';
  }, [shadow]);

  return {
    shadowStyle,
  };
}
