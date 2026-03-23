import { useMemo } from 'react';
import type { ImageElementFilters } from '@/lib/types/slides';

/**
 * 从图片滤镜数组计算 CSS filter 字符串
 * @param filters 图片滤镜数组
 */
export function useFilter(filters?: ImageElementFilters) {
  const filter = useMemo(() => {
    if (!filters) return '';
    let filterStr = '';
    for (const f of Object.values(filters)) {
      filterStr += `${f.type}(${f.value}) `;
    }
    return filterStr.trim();
  }, [filters]);

  return {
    filter,
  };
}
