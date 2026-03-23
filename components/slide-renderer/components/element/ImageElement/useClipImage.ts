import { useMemo } from 'react';
import type { PPTImageElement } from '@/lib/types/slides';
import { CLIPPATHS, ClipPathTypes } from '@/configs/image-clip';

/**
 * 计算图片裁剪形状和位置
 * @param element 图片元素
 */
export function useClipImage(element: PPTImageElement) {
  const clipShape = useMemo(() => {
    let _clipShape = CLIPPATHS.rect;

    if (element.clip) {
      const shape = element.clip.shape || ClipPathTypes.RECT;
      _clipShape = CLIPPATHS[shape];
    }
    if (_clipShape.radius !== undefined && element.radius) {
      _clipShape = {
        ..._clipShape,
        radius: `${element.radius}px`,
        style: `inset(0 round ${element.radius}px)`,
      };
    }

    return _clipShape;
  }, [element.clip, element.radius]);

  const imgPosition = useMemo(() => {
    if (!element.clip || !element.clip.range) {
      return {
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
      };
    }

    const [start, end] = element.clip.range;

    const widthScale = (end[0] - start[0]) / 100;
    const heightScale = (end[1] - start[1]) / 100;
    const left = start[0] / widthScale;
    const top = start[1] / heightScale;

    return {
      left: -left + '%',
      top: -top + '%',
      width: 100 / widthScale + '%',
      height: 100 / heightScale + '%',
    };
  }, [element.clip]);

  return {
    clipShape,
    imgPosition,
  };
}
