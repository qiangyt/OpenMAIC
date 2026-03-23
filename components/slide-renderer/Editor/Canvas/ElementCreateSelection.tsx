import { useState, useRef, useEffect, useMemo } from 'react';
import { useCanvasStore } from '@/lib/store';
import { useKeyboardStore } from '@/lib/store/keyboard';
import type { CreateElementSelectionData } from '@/lib/types/edit';

interface ElementCreateSelectionProps {
  onCreated: (data: CreateElementSelectionData) => void;
}

export function ElementCreateSelection({ onCreated }: ElementCreateSelectionProps) {
  const creatingElement = useCanvasStore.use.creatingElement();
  const setCreatingElement = useCanvasStore.use.setCreatingElement();
  const ctrlOrShiftKeyActive = useKeyboardStore((state) => state.ctrlOrShiftKeyActive());

  const [start, setStart] = useState<[number, number]>();
  const [end, setEnd] = useState<[number, number]>();
  const selectionRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!selectionRef.current) return;
    const { x, y } = selectionRef.current.getBoundingClientRect();
    setOffset({ x, y });
  }, []);

  // 鼠标拖拽创建元素：确定位置和尺寸
  // 获取选区范围的起始和结束位置
  const createSelection = (e: React.MouseEvent) => {
    let isMouseDown = true;

    const startPageX = e.pageX;
    const startPageY = e.pageY;
    setStart([startPageX, startPageY]);

    const handleMouseMove = (e: MouseEvent) => {
      if (!creatingElement || !isMouseDown) return;

      let currentPageX = e.pageX;
      let currentPageY = e.pageY;

      // 当按住 Ctrl 或 Shift 时：
      // 非线条元素锁定宽高比；线条元素锁定为水平或垂直方向
      if (ctrlOrShiftKeyActive) {
        const moveX = currentPageX - startPageX;
        const moveY = currentPageY - startPageY;

        // 水平和垂直拖拽距离；使用较大值作为基准来计算另一个
        const absX = Math.abs(moveX);
        const absY = Math.abs(moveY);

        if (creatingElement.type === 'shape') {
          // 检查是否反向拖拽：左上到右下为正向，其他为反向
          const isOpposite = (moveY > 0 && moveX < 0) || (moveY < 0 && moveX > 0);

          if (absX > absY) {
            currentPageY = isOpposite ? startPageY - moveX : startPageY + moveX;
          } else {
            currentPageX = isOpposite ? startPageX - moveY : startPageX + moveY;
          }
        } else if (creatingElement.type === 'line') {
          if (absX > absY) currentPageY = startPageY;
          else currentPageX = startPageX;
        }
      }

      setEnd([currentPageX, currentPageY]);
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (e.button === 2) {
        setTimeout(() => setCreatingElement(null), 0);
        return;
      }

      isMouseDown = false;

      const endPageX = e.pageX;
      const endPageY = e.pageY;

      const minSize = 30;

      if (
        creatingElement?.type === 'line' &&
        (Math.abs(endPageX - startPageX) >= minSize || Math.abs(endPageY - startPageY) >= minSize)
      ) {
        onCreated({
          start: [startPageX, startPageY],
          end: [endPageX, endPageY],
        });
      } else if (
        creatingElement?.type !== 'line' &&
        Math.abs(endPageX - startPageX) >= minSize &&
        Math.abs(endPageY - startPageY) >= minSize
      ) {
        onCreated({
          start: [startPageX, startPageY],
          end: [endPageX, endPageY],
        });
      } else {
        const defaultSize = 200;
        const minX = Math.min(endPageX, startPageX);
        const minY = Math.min(endPageY, startPageY);
        const maxX = Math.max(endPageX, startPageX);
        const maxY = Math.max(endPageY, startPageY);
        const offsetX = maxX - minX >= minSize ? maxX - minX : defaultSize;
        const offsetY = maxY - minY >= minSize ? maxY - minY : defaultSize;
        onCreated({
          start: [minX, minY],
          end: [minX + offsetX, minY + offsetY],
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 线条绘制路径数据（仅在创建元素类型为线条时使用）
  const lineData = useMemo(() => {
    if (!start || !end) return null;
    if (!creatingElement || creatingElement.type !== 'line') return null;

    const [_startX, _startY] = start;
    const [_endX, _endY] = end;
    const minX = Math.min(_startX, _endX);
    const maxX = Math.max(_startX, _endX);
    const minY = Math.min(_startY, _endY);
    const maxY = Math.max(_startY, _endY);

    const svgWidth = maxX - minX >= 24 ? maxX - minX : 24;
    const svgHeight = maxY - minY >= 24 ? maxY - minY : 24;

    const startX = _startX === minX ? 0 : maxX - minX;
    const startY = _startY === minY ? 0 : maxY - minY;
    const endX = _endX === minX ? 0 : maxX - minX;
    const endY = _endY === minY ? 0 : maxY - minY;

    const path = `M${startX}, ${startY} L${endX}, ${endY}`;

    return {
      svgWidth,
      svgHeight,
      path,
    };
  }, [start, end, creatingElement]);

  // 根据选区起始和结束位置计算元素位置和尺寸
  const position = useMemo(() => {
    if (!start || !end) return {};

    const [startX, startY] = start;
    const [endX, endY] = end;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      left: minX - offset.x + 'px',
      top: minY - offset.y + 'px',
      width: width + 'px',
      height: height + 'px',
    };
  }, [start, end, offset]);

  return (
    <div
      ref={selectionRef}
      className="element-create-selection absolute top-0 left-0 w-full h-full z-[2] cursor-crosshair"
      onMouseDown={(e) => {
        e.stopPropagation();
        createSelection(e);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {start && end && (
        <div
          className={`selection absolute opacity-80 ${creatingElement?.type !== 'line' ? 'border border-primary' : ''}`}
          style={position}
        >
          {/* 线条绘制区域 */}
          {creatingElement?.type === 'line' && lineData && (
            <svg className="overflow-visible" width={lineData.svgWidth} height={lineData.svgHeight}>
              <path d={lineData.path} stroke="#d14424" fill="none" strokeWidth="2" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
