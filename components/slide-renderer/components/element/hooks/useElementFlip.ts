import { useMemo } from 'react';

/**
 * 计算元素翻转变换样式
 * 处理水平和/或垂直翻转
 * @param flipH 水平翻转
 * @param flipV 垂直翻转
 */
export function useElementFlip(flipH?: boolean, flipV?: boolean) {
  const flipStyle = useMemo(() => {
    let style = '';

    if (flipH && flipV) style = 'rotateX(180deg) rotateY(180deg)';
    else if (flipV) style = 'rotateX(180deg)';
    else if (flipH) style = 'rotateY(180deg)';

    return style;
  }, [flipH, flipV]);

  return {
    flipStyle,
  };
}
