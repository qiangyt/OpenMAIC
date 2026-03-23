import { useMemo } from 'react';
import { ElementTypes, type PPTElement } from '@/lib/types/slides';

import { BaseImageElement } from '../element/ImageElement/BaseImageElement';
import { BaseTextElement } from '../element/TextElement/BaseTextElement';
import { BaseShapeElement } from '../element/ShapeElement/BaseShapeElement';
import { BaseLineElement } from '../element/LineElement/BaseLineElement';
import { BaseChartElement } from '../element/ChartElement/BaseChartElement';
import { BaseLatexElement } from '../element/LatexElement/BaseLatexElement';
import { BaseTableElement } from '../element/TableElement/BaseTableElement';
import { BaseVideoElement } from '../element/VideoElement/BaseVideoElement';

interface ThumbnailElementProps {
  readonly elementInfo: PPTElement;
  readonly elementIndex: number;
}

/**
 * 缩略图元素组件
 *
 * 根据元素类型渲染对应的 Base 组件
 */
export function ThumbnailElement({ elementInfo, elementIndex }: ThumbnailElementProps) {
  const CurrentElementComponent = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- element components have varying prop signatures
    const elementTypeMap: Record<string, any> = {
      [ElementTypes.IMAGE]: BaseImageElement,
      [ElementTypes.TEXT]: BaseTextElement,
      [ElementTypes.SHAPE]: BaseShapeElement,
      [ElementTypes.LINE]: BaseLineElement,
      [ElementTypes.CHART]: BaseChartElement,
      [ElementTypes.LATEX]: BaseLatexElement,
      [ElementTypes.TABLE]: BaseTableElement,
      // TODO: 添加其他元素类型
      [ElementTypes.VIDEO]: BaseVideoElement,
      // [ElementTypes.AUDIO]: BaseAudioElement,
    };
    return elementTypeMap[elementInfo.type] || null;
  }, [elementInfo.type]);

  if (!CurrentElementComponent) {
    return null;
  }

  return (
    <div
      className={`base-element base-element-${elementInfo.id}`}
      style={{
        zIndex: elementIndex,
      }}
    >
      <CurrentElementComponent elementInfo={elementInfo} target="thumbnail" />
    </div>
  );
}
