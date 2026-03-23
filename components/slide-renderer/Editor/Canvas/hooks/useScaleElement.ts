import { useCallback } from 'react';
import { useCanvasStore } from '@/lib/store';
import { useKeyboardStore } from '@/lib/store/keyboard';
import type {
  PPTElement,
  PPTLineElement,
  PPTImageElement,
  PPTShapeElement,
} from '@/lib/types/slides';
import {
  OperateResizeHandlers,
  type AlignmentLineProps,
  type MultiSelectRange,
} from '@/lib/types/edit';
import { MIN_SIZE } from '@/configs/element';
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes';
import { type AlignLine, uniqAlignLines } from '@/lib/utils/element';
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';

interface RotateElementData {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 计算旋转元素的八个缩放点位置
 * @param element 元素的原始位置和尺寸
 * @param angle 旋转角度
 */
const getRotateElementPoints = (element: RotateElementData, angle: number) => {
  const { left, top, width, height } = element;

  const radius = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)) / 2;
  const auxiliaryAngle = (Math.atan(height / width) * 180) / Math.PI;

  const tlbraRadian = ((180 - angle - auxiliaryAngle) * Math.PI) / 180;
  const trblaRadian = ((auxiliaryAngle - angle) * Math.PI) / 180;
  const taRadian = ((90 - angle) * Math.PI) / 180;
  const raRadian = (angle * Math.PI) / 180;

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const middleLeft = left + halfWidth;
  const middleTop = top + halfHeight;

  const leftTopPoint = {
    left: middleLeft + radius * Math.cos(tlbraRadian),
    top: middleTop - radius * Math.sin(tlbraRadian),
  };
  const topPoint = {
    left: middleLeft + halfHeight * Math.cos(taRadian),
    top: middleTop - halfHeight * Math.sin(taRadian),
  };
  const rightTopPoint = {
    left: middleLeft + radius * Math.cos(trblaRadian),
    top: middleTop - radius * Math.sin(trblaRadian),
  };
  const rightPoint = {
    left: middleLeft + halfWidth * Math.cos(raRadian),
    top: middleTop + halfWidth * Math.sin(raRadian),
  };
  const rightBottomPoint = {
    left: middleLeft - radius * Math.cos(tlbraRadian),
    top: middleTop + radius * Math.sin(tlbraRadian),
  };
  const bottomPoint = {
    left: middleLeft - halfHeight * Math.sin(raRadian),
    top: middleTop + halfHeight * Math.cos(raRadian),
  };
  const leftBottomPoint = {
    left: middleLeft - radius * Math.cos(trblaRadian),
    top: middleTop + radius * Math.sin(trblaRadian),
  };
  const leftPoint = {
    left: middleLeft - halfWidth * Math.cos(raRadian),
    top: middleTop - halfWidth * Math.sin(raRadian),
  };

  return {
    leftTopPoint,
    topPoint,
    rightTopPoint,
    rightPoint,
    rightBottomPoint,
    bottomPoint,
    leftBottomPoint,
    leftPoint,
  };
};

/**
 * 获取给定缩放点的对角点，例如 [top] 对应 [bottom]，[left-top] 对应 [right-bottom]
 * @param direction 当前操作的缩放点
 * @param points 旋转元素的八个缩放点位置
 */
const getOppositePoint = (
  direction: OperateResizeHandlers,
  points: ReturnType<typeof getRotateElementPoints>,
): { left: number; top: number } => {
  const oppositeMap = {
    [OperateResizeHandlers.RIGHT_BOTTOM]: points.leftTopPoint,
    [OperateResizeHandlers.LEFT_BOTTOM]: points.rightTopPoint,
    [OperateResizeHandlers.LEFT_TOP]: points.rightBottomPoint,
    [OperateResizeHandlers.RIGHT_TOP]: points.leftBottomPoint,
    [OperateResizeHandlers.TOP]: points.bottomPoint,
    [OperateResizeHandlers.BOTTOM]: points.topPoint,
    [OperateResizeHandlers.LEFT]: points.rightPoint,
    [OperateResizeHandlers.RIGHT]: points.leftPoint,
  };
  return oppositeMap[direction];
};

/**
 * 缩放元素 Hook
 *
 * @param elementListRef - 元素列表 ref（存储最新值）
 * @param setElementList - 元素列表 setter（用于触发重新渲染）
 * @param setAlignmentLines - 对齐线 setter
 */
export function useScaleElement(
  elementListRef: React.RefObject<PPTElement[]>,
  setElementList: React.Dispatch<React.SetStateAction<PPTElement[]>>,
  setAlignmentLines: React.Dispatch<React.SetStateAction<AlignmentLineProps[]>>,
) {
  const setScalingState = useCanvasStore.use.setScalingState();
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const canvasScale = useCanvasStore.use.canvasScale();

  const viewportRatio = useCanvasStore.use.viewportRatio();
  const viewportSize = useCanvasStore.use.viewportSize();

  const updateSlide = useCanvasOperations().updateSlide;

  const ctrlOrShiftKeyActive = useKeyboardStore((state) => state.ctrlOrShiftKeyActive());

  const { addHistorySnapshot } = useHistorySnapshot();

  // 缩放元素
  const scaleElement = useCallback(
    (
      e: React.MouseEvent | React.TouchEvent,
      element: Exclude<PPTElement, PPTLineElement>,
      command: OperateResizeHandlers,
    ) => {
      const native = e.nativeEvent;
      const isTouchEvent = native instanceof TouchEvent;
      if (isTouchEvent && !native.changedTouches?.length) return;

      let isMouseDown = true;
      setScalingState(true);

      const elOriginLeft = element.left;
      const elOriginTop = element.top;
      const elOriginWidth = element.width;
      const elOriginHeight = element.height;

      const originTableCellMinHeight = element.type === 'table' ? element.cellMinHeight : 0;

      const elRotate = 'rotate' in element && element.rotate ? element.rotate : 0;
      const rotateRadian = (Math.PI * elRotate) / 180;

      const fixedRatio = ctrlOrShiftKeyActive || ('fixedRatio' in element && element.fixedRatio);
      const aspectRatio = elOriginWidth / elOriginHeight;

      const startPageX = isTouchEvent ? native.changedTouches[0].pageX : native.pageX;
      const startPageY = isTouchEvent ? native.changedTouches[0].pageY : native.pageY;

      // 元素最小缩放尺寸限制
      const minSize = MIN_SIZE[element.type] || 20;
      const getSizeWithinRange = (size: number, type: 'width' | 'height') => {
        if (!fixedRatio) return size < minSize ? minSize : size;

        let minWidth = minSize;
        let minHeight = minSize;
        const ratio = element.width / element.height;
        if (ratio < 1) minHeight = minSize / ratio;
        if (ratio > 1) minWidth = minSize * ratio;

        if (type === 'width') return size < minWidth ? minWidth : size;
        return size < minHeight ? minHeight : size;
      };

      let points: ReturnType<typeof getRotateElementPoints>;
      let baseLeft = 0;
      let baseTop = 0;
      let horizontalLines: AlignLine[] = [];
      let verticalLines: AlignLine[] = [];

      // 缩放旋转元素时，引入基点概念：当前缩放手柄的对角点
      // 例如拖拽右下角时，左上角是基点，保持固定而其他点移动以实现缩放
      if ('rotate' in element && element.rotate) {
        const { left, top, width, height } = element;
        points = getRotateElementPoints({ left, top, width, height }, elRotate);
        const oppositePoint = getOppositePoint(command, points);

        baseLeft = oppositePoint.left;
        baseTop = oppositePoint.top;
      }
      // 非旋转元素在缩放时支持对齐吸附；在此收集对齐吸附线
      // 包括画布上除目标元素外所有元素的可吸附对齐位置（上、下、左、右边缘）
      // 线条元素和旋转元素不参与对齐吸附
      else {
        const edgeWidth = viewportSize;
        const edgeHeight = viewportSize * viewportRatio;
        const isActiveGroupElement = element.id === activeGroupElementId;

        for (const el of elementListRef.current) {
          if ('rotate' in el && el.rotate) continue;
          if (el.type === 'line') continue;
          if (isActiveGroupElement && el.id === element.id) continue;
          if (!isActiveGroupElement && activeElementIdList.includes(el.id)) continue;

          const left = el.left;
          const top = el.top;
          const width = el.width;
          const height = el.height;
          const right = left + width;
          const bottom = top + height;

          const topLine: AlignLine = { value: top, range: [left, right] };
          const bottomLine: AlignLine = { value: bottom, range: [left, right] };
          const leftLine: AlignLine = { value: left, range: [top, bottom] };
          const rightLine: AlignLine = { value: right, range: [top, bottom] };

          horizontalLines.push(topLine, bottomLine);
          verticalLines.push(leftLine, rightLine);
        }

        // 可视画布区域的四条边界、水平中心和垂直中心
        const edgeTopLine: AlignLine = { value: 0, range: [0, edgeWidth] };
        const edgeBottomLine: AlignLine = {
          value: edgeHeight,
          range: [0, edgeWidth],
        };
        const edgeHorizontalCenterLine: AlignLine = {
          value: edgeHeight / 2,
          range: [0, edgeWidth],
        };
        const edgeLeftLine: AlignLine = { value: 0, range: [0, edgeHeight] };
        const edgeRightLine: AlignLine = {
          value: edgeWidth,
          range: [0, edgeHeight],
        };
        const edgeVerticalCenterLine: AlignLine = {
          value: edgeWidth / 2,
          range: [0, edgeHeight],
        };

        horizontalLines.push(edgeTopLine, edgeBottomLine, edgeHorizontalCenterLine);
        verticalLines.push(edgeLeftLine, edgeRightLine, edgeVerticalCenterLine);

        horizontalLines = uniqAlignLines(horizontalLines);
        verticalLines = uniqAlignLines(verticalLines);
      }

      // 对齐吸附方法
      // 将收集的对齐吸附线与目标元素当前位置/尺寸数据进行比较；当差值在阈值内时自动校正
      // 水平和垂直方向分别计算
      const alignedAdsorption = (currentX: number | null, currentY: number | null) => {
        const sorptionRange = 5;

        const _alignmentLines: AlignmentLineProps[] = [];
        let isVerticalAdsorbed = false;
        let isHorizontalAdsorbed = false;
        const correctionVal = { offsetX: 0, offsetY: 0 };

        if (currentY || currentY === 0) {
          for (let i = 0; i < horizontalLines.length; i++) {
            const { value, range } = horizontalLines[i];
            const min = Math.min(...range, currentX || 0);
            const max = Math.max(...range, currentX || 0);

            if (Math.abs(currentY - value) < sorptionRange && !isHorizontalAdsorbed) {
              correctionVal.offsetY = currentY - value;
              isHorizontalAdsorbed = true;
              _alignmentLines.push({
                type: 'horizontal',
                axis: { x: min - 50, y: value },
                length: max - min + 100,
              });
            }
          }
        }
        if (currentX || currentX === 0) {
          for (let i = 0; i < verticalLines.length; i++) {
            const { value, range } = verticalLines[i];
            const min = Math.min(...range, currentY || 0);
            const max = Math.max(...range, currentY || 0);

            if (Math.abs(currentX - value) < sorptionRange && !isVerticalAdsorbed) {
              correctionVal.offsetX = currentX - value;
              isVerticalAdsorbed = true;
              _alignmentLines.push({
                type: 'vertical',
                axis: { x: value, y: min - 50 },
                length: max - min + 100,
              });
            }
          }
        }
        setAlignmentLines(_alignmentLines);
        return correctionVal;
      };

      const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isMouseDown) return;

        const currentPageX = e instanceof MouseEvent ? e.pageX : e.changedTouches[0].pageX;
        const currentPageY = e instanceof MouseEvent ? e.pageY : e.changedTouches[0].pageY;

        const x = currentPageX - startPageX;
        const y = currentPageY - startPageY;

        let width = elOriginWidth;
        let height = elOriginHeight;
        let left = elOriginLeft;
        let top = elOriginTop;

        // 对于旋转元素，根据旋转角度重新计算缩放距离（鼠标按下后移动的距离）
        if (elRotate) {
          const revisedX = (Math.cos(rotateRadian) * x + Math.sin(rotateRadian) * y) / canvasScale;
          let revisedY = (Math.cos(rotateRadian) * y - Math.sin(rotateRadian) * x) / canvasScale;

          // 锁定宽高比（仅由四个角触发，不包括边缘）
          // 以水平缩放距离为基准计算垂直缩放距离，保持相同比例
          if (fixedRatio) {
            if (
              command === OperateResizeHandlers.RIGHT_BOTTOM ||
              command === OperateResizeHandlers.LEFT_TOP
            )
              revisedY = revisedX / aspectRatio;
            if (
              command === OperateResizeHandlers.LEFT_BOTTOM ||
              command === OperateResizeHandlers.RIGHT_TOP
            )
              revisedY = -revisedX / aspectRatio;
          }

          // 根据操作点计算缩放后的元素尺寸和位置
          // 注意：
          // 这里计算的位置需要后续校正，因为缩放旋转元素会改变基点位置（视觉上基点保持固定，但那是旋转+平移的组合结果）
          // 但尺寸不需要校正，因为缩放距离已在上面重新计算过
          if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
            width = getSizeWithinRange(elOriginWidth + revisedX, 'width');
            height = getSizeWithinRange(elOriginHeight + revisedY, 'height');
          } else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
            width = getSizeWithinRange(elOriginWidth - revisedX, 'width');
            height = getSizeWithinRange(elOriginHeight + revisedY, 'height');
            left = elOriginLeft - (width - elOriginWidth);
          } else if (command === OperateResizeHandlers.LEFT_TOP) {
            width = getSizeWithinRange(elOriginWidth - revisedX, 'width');
            height = getSizeWithinRange(elOriginHeight - revisedY, 'height');
            left = elOriginLeft - (width - elOriginWidth);
            top = elOriginTop - (height - elOriginHeight);
          } else if (command === OperateResizeHandlers.RIGHT_TOP) {
            width = getSizeWithinRange(elOriginWidth + revisedX, 'width');
            height = getSizeWithinRange(elOriginHeight - revisedY, 'height');
            top = elOriginTop - (height - elOriginHeight);
          } else if (command === OperateResizeHandlers.TOP) {
            height = getSizeWithinRange(elOriginHeight - revisedY, 'height');
            top = elOriginTop - (height - elOriginHeight);
          } else if (command === OperateResizeHandlers.BOTTOM) {
            height = getSizeWithinRange(elOriginHeight + revisedY, 'height');
          } else if (command === OperateResizeHandlers.LEFT) {
            width = getSizeWithinRange(elOriginWidth - revisedX, 'width');
            left = elOriginLeft - (width - elOriginWidth);
          } else if (command === OperateResizeHandlers.RIGHT) {
            width = getSizeWithinRange(elOriginWidth + revisedX, 'width');
          }

          // 获取当前基点坐标，与初始基点比较，通过差值校正元素位置
          const currentPoints = getRotateElementPoints({ width, height, left, top }, elRotate);
          const currentOppositePoint = getOppositePoint(command, currentPoints);
          const currentBaseLeft = currentOppositePoint.left;
          const currentBaseTop = currentOppositePoint.top;

          const offsetX = currentBaseLeft - baseLeft;
          const offsetY = currentBaseTop - baseTop;

          left = left - offsetX;
          top = top - offsetY;
        }
        // 对于非旋转元素，简单计算新位置和尺寸，无需复杂校正
        // 额外处理对齐吸附操作
        // 宽高比锁定逻辑同上
        else {
          let moveX = x / canvasScale;
          let moveY = y / canvasScale;

          if (fixedRatio) {
            if (
              command === OperateResizeHandlers.RIGHT_BOTTOM ||
              command === OperateResizeHandlers.LEFT_TOP
            )
              moveY = moveX / aspectRatio;
            if (
              command === OperateResizeHandlers.LEFT_BOTTOM ||
              command === OperateResizeHandlers.RIGHT_TOP
            )
              moveY = -moveX / aspectRatio;
          }

          if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
            const { offsetX, offsetY } = alignedAdsorption(
              elOriginLeft + elOriginWidth + moveX,
              elOriginTop + elOriginHeight + moveY,
            );
            moveX = moveX - offsetX;
            moveY = moveY - offsetY;
            if (fixedRatio) {
              if (offsetY) moveX = moveY * aspectRatio;
              else moveY = moveX / aspectRatio;
            }
            width = getSizeWithinRange(elOriginWidth + moveX, 'width');
            height = getSizeWithinRange(elOriginHeight + moveY, 'height');
          } else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
            const { offsetX, offsetY } = alignedAdsorption(
              elOriginLeft + moveX,
              elOriginTop + elOriginHeight + moveY,
            );
            moveX = moveX - offsetX;
            moveY = moveY - offsetY;
            if (fixedRatio) {
              if (offsetY) moveX = -moveY * aspectRatio;
              else moveY = -moveX / aspectRatio;
            }
            width = getSizeWithinRange(elOriginWidth - moveX, 'width');
            height = getSizeWithinRange(elOriginHeight + moveY, 'height');
            left = elOriginLeft - (width - elOriginWidth);
          } else if (command === OperateResizeHandlers.LEFT_TOP) {
            const { offsetX, offsetY } = alignedAdsorption(
              elOriginLeft + moveX,
              elOriginTop + moveY,
            );
            moveX = moveX - offsetX;
            moveY = moveY - offsetY;
            if (fixedRatio) {
              if (offsetY) moveX = moveY * aspectRatio;
              else moveY = moveX / aspectRatio;
            }
            width = getSizeWithinRange(elOriginWidth - moveX, 'width');
            height = getSizeWithinRange(elOriginHeight - moveY, 'height');
            left = elOriginLeft - (width - elOriginWidth);
            top = elOriginTop - (height - elOriginHeight);
          } else if (command === OperateResizeHandlers.RIGHT_TOP) {
            const { offsetX, offsetY } = alignedAdsorption(
              elOriginLeft + elOriginWidth + moveX,
              elOriginTop + moveY,
            );
            moveX = moveX - offsetX;
            moveY = moveY - offsetY;
            if (fixedRatio) {
              if (offsetY) moveX = -moveY * aspectRatio;
              else moveY = -moveX / aspectRatio;
            }
            width = getSizeWithinRange(elOriginWidth + moveX, 'width');
            height = getSizeWithinRange(elOriginHeight - moveY, 'height');
            top = elOriginTop - (height - elOriginHeight);
          } else if (command === OperateResizeHandlers.LEFT) {
            const { offsetX } = alignedAdsorption(elOriginLeft + moveX, null);
            moveX = moveX - offsetX;
            width = getSizeWithinRange(elOriginWidth - moveX, 'width');
            left = elOriginLeft - (width - elOriginWidth);
          } else if (command === OperateResizeHandlers.RIGHT) {
            const { offsetX } = alignedAdsorption(elOriginLeft + elOriginWidth + moveX, null);
            moveX = moveX - offsetX;
            width = getSizeWithinRange(elOriginWidth + moveX, 'width');
          } else if (command === OperateResizeHandlers.TOP) {
            const { offsetY } = alignedAdsorption(null, elOriginTop + moveY);
            moveY = moveY - offsetY;
            height = getSizeWithinRange(elOriginHeight - moveY, 'height');
            top = elOriginTop - (height - elOriginHeight);
          } else if (command === OperateResizeHandlers.BOTTOM) {
            const { offsetY } = alignedAdsorption(null, elOriginTop + elOriginHeight + moveY);
            moveY = moveY - offsetY;
            height = getSizeWithinRange(elOriginHeight + moveY, 'height');
          }
        }

        // 在 mousemove 期间更新本地元素列表
        const newElements = elementListRef.current.map((el) => {
          if (element.id !== el.id) return el;
          if (el.type === 'shape' && 'pathFormula' in el && el.pathFormula) {
            const pathFormula = SHAPE_PATH_FORMULAS[el.pathFormula];

            let path = '';
            if ('editable' in pathFormula) path = pathFormula.formula(width, height, el.keypoints!);
            else path = pathFormula.formula(width, height);

            return {
              ...el,
              left,
              top,
              width,
              height,
              viewBox: [width, height] as [number, number],
              path,
            };
          }
          if (el.type === 'table') {
            let cellMinHeight =
              originTableCellMinHeight + (height - elOriginHeight) / el.data.length;
            cellMinHeight = cellMinHeight < 36 ? 36 : cellMinHeight;

            if (cellMinHeight === originTableCellMinHeight) return { ...el, left, width };
            return {
              ...el,
              left,
              top,
              width,
              height,
              cellMinHeight: cellMinHeight < 36 ? 36 : cellMinHeight,
            };
          }
          return { ...el, left, top, width, height };
        });

        // 同时更新 ref 和 state
        elementListRef.current = newElements;
        setElementList(newElements);
      };

      const handleMouseUp = (e: MouseEvent | TouchEvent) => {
        isMouseDown = false;

        document.ontouchmove = null;
        document.ontouchend = null;
        document.onmousemove = null;
        document.onmouseup = null;

        setAlignmentLines([]);

        const currentPageX = e instanceof MouseEvent ? e.pageX : e.changedTouches[0].pageX;
        const currentPageY = e instanceof MouseEvent ? e.pageY : e.changedTouches[0].pageY;

        if (startPageX === currentPageX && startPageY === currentPageY) return;

        setScalingState(false);

        updateSlide({ elements: elementListRef.current });
        addHistorySnapshot();
      };

      if (isTouchEvent) {
        document.ontouchmove = handleMouseMove;
        document.ontouchend = handleMouseUp;
      } else {
        document.onmousemove = handleMouseMove;
        document.onmouseup = handleMouseUp;
      }
    },
    [
      elementListRef,
      setElementList,
      canvasScale,
      activeElementIdList,
      activeGroupElementId,
      viewportRatio,
      viewportSize,
      ctrlOrShiftKeyActive,
      setScalingState,
      setAlignmentLines,
      updateSlide,
      addHistorySnapshot,
    ],
  );

  // 缩放多个选中元素
  const scaleMultiElement = useCallback(
    (e: React.MouseEvent, range: MultiSelectRange, command: OperateResizeHandlers) => {
      let isMouseDown = true;

      const { minX, maxX, minY, maxY } = range;
      const operateWidth = maxX - minX;
      const operateHeight = maxY - minY;
      const aspectRatio = operateWidth / operateHeight;

      const startPageX = e.pageX;
      const startPageY = e.pageY;

      const originElementList: PPTElement[] = JSON.parse(JSON.stringify(elementListRef.current));

      const handleMouseMove = (e: MouseEvent) => {
        if (!isMouseDown) return;

        const currentPageX = e.pageX;
        const currentPageY = e.pageY;

        const x = (currentPageX - startPageX) / canvasScale;
        let y = (currentPageY - startPageY) / canvasScale;

        // 锁定宽高比，逻辑同上
        if (ctrlOrShiftKeyActive) {
          if (
            command === OperateResizeHandlers.RIGHT_BOTTOM ||
            command === OperateResizeHandlers.LEFT_TOP
          )
            y = x / aspectRatio;
          if (
            command === OperateResizeHandlers.LEFT_BOTTOM ||
            command === OperateResizeHandlers.RIGHT_TOP
          )
            y = -x / aspectRatio;
        }

        // 所有选中元素的整体范围
        let currentMinX = minX;
        let currentMaxX = maxX;
        let currentMinY = minY;
        let currentMaxY = maxY;

        if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
          currentMaxX = maxX + x;
          currentMaxY = maxY + y;
        } else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
          currentMinX = minX + x;
          currentMaxY = maxY + y;
        } else if (command === OperateResizeHandlers.LEFT_TOP) {
          currentMinX = minX + x;
          currentMinY = minY + y;
        } else if (command === OperateResizeHandlers.RIGHT_TOP) {
          currentMaxX = maxX + x;
          currentMinY = minY + y;
        } else if (command === OperateResizeHandlers.TOP) {
          currentMinY = minY + y;
        } else if (command === OperateResizeHandlers.BOTTOM) {
          currentMaxY = maxY + y;
        } else if (command === OperateResizeHandlers.LEFT) {
          currentMinX = minX + x;
        } else if (command === OperateResizeHandlers.RIGHT) {
          currentMaxX = maxX + x;
        }

        // 所有选中元素的整体宽度和高度
        const currentOppositeWidth = currentMaxX - currentMinX;
        const currentOppositeHeight = currentMaxY - currentMinY;

        // 当前操作元素的宽度/高度与所有选中元素整体宽度/高度的比率
        let widthScale = currentOppositeWidth / operateWidth;
        let heightScale = currentOppositeHeight / operateHeight;

        if (widthScale <= 0) widthScale = 0;
        if (heightScale <= 0) heightScale = 0;

        // 根据计算的比率更新所有选中元素的位置和尺寸
        const newElements = elementListRef.current.map((el) => {
          if ((el.type === 'image' || el.type === 'shape') && activeElementIdList.includes(el.id)) {
            const originElement = originElementList.find((originEl) => originEl.id === el.id) as
              | PPTImageElement
              | PPTShapeElement;
            return {
              ...el,
              width: originElement.width * widthScale,
              height: originElement.height * heightScale,
              left: currentMinX + (originElement.left - minX) * widthScale,
              top: currentMinY + (originElement.top - minY) * heightScale,
            };
          }
          return el;
        });

        elementListRef.current = newElements;
        setElementList(newElements);
      };

      const handleMouseUp = (e: MouseEvent) => {
        isMouseDown = false;
        document.onmousemove = null;
        document.onmouseup = null;

        if (startPageX === e.pageX && startPageY === e.pageY) return;

        updateSlide({ elements: elementListRef.current });
        addHistorySnapshot();
      };

      document.onmousemove = handleMouseMove;
      document.onmouseup = handleMouseUp;
    },
    [
      elementListRef,
      setElementList,
      canvasScale,
      activeElementIdList,
      ctrlOrShiftKeyActive,
      updateSlide,
      addHistorySnapshot,
    ],
  );

  return {
    scaleElement,
    scaleMultiElement,
  };
}
