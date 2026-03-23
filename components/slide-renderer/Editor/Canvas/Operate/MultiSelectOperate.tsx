import { useMemo, useEffect, useState } from 'react';
import { useCanvasStore } from '@/lib/store';
import type { PPTElement } from '@/lib/types/slides';
import { getElementListRange } from '@/lib/utils/element';
import type { OperateResizeHandlers, MultiSelectRange } from '@/lib/types/edit';
import { useCommonOperate } from '../hooks/useCommonOperate';
import { ResizeHandler } from './ResizeHandler';
import { BorderLine } from './BorderLine';

interface MultiSelectOperateProps {
  readonly elementList: PPTElement[];
  readonly scaleMultiElement: (
    e: React.MouseEvent,
    range: MultiSelectRange,
    command: OperateResizeHandlers,
  ) => void;
}

export function MultiSelectOperate({ elementList, scaleMultiElement }: MultiSelectOperateProps) {
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const canvasScale = useCanvasStore.use.canvasScale();

  const localActiveElementList = useMemo(
    () => elementList.filter((el) => activeElementIdList.includes(el.id)),
    [elementList, activeElementIdList],
  );

  const [range, setRange] = useState<MultiSelectRange>({
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  });

  // 根据画布上的多选范围计算边框线 and 缩放手柄
  const width = useMemo(() => (range.maxX - range.minX) * canvasScale, [range, canvasScale]);
  const height = useMemo(() => (range.maxY - range.minY) * canvasScale, [range, canvasScale]);
  const { resizeHandlers, borderLines } = useCommonOperate(width, height);

  // 计算画布上多选元素的整体范围
  useEffect(() => {
    const { minX, maxX, minY, maxY } = getElementListRange(localActiveElementList);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM 测量需要在 effect 中进行
    setRange({ minX, maxX, minY, maxY });
  }, [localActiveElementList]);

  // 多选时禁用缩放：只有非旋转的图片和形状可以被缩放
  const disableResize = useMemo(() => {
    return localActiveElementList.some((item) => {
      if ((item.type === 'image' || item.type === 'shape') && !item.rotate) return false;
      return true;
    });
  }, [localActiveElementList]);

  return (
    <div
      className="multi-select-operate absolute top-0 left-0 z-44"
      style={{
        left: range.minX * canvasScale + 'px',
        top: range.minY * canvasScale + 'px',
        pointerEvents: 'auto', // 启用多选控件鼠标事件
      }}
    >
      {borderLines.map((line) => (
        <BorderLine key={line.type} type={line.type} style={line.style} />
      ))}

      {!disableResize &&
        resizeHandlers.map((point) => (
          <ResizeHandler
            key={point.direction}
            type={point.direction}
            style={point.style}
            onMouseDown={(e) => {
              e.stopPropagation();
              scaleMultiElement(e, range, point.direction);
            }}
          />
        ))}
    </div>
  );
}
