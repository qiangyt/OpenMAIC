import { useState, useCallback, type RefObject } from 'react';
import { useKeyboardStore } from '@/lib/store/keyboard';
import { useCanvasStore } from '@/lib/store';
import type { PPTElement } from '@/lib/types/slides';
import { getElementRange } from '@/lib/utils/element';

export function useMouseSelection(
  elementListRef: React.RefObject<PPTElement[]>,
  viewportRef: RefObject<HTMLElement | null>,
) {
  const [mouseSelectionVisible, setMouseSelectionVisible] = useState(false);
  const [mouseSelectionQuadrant, setMouseSelectionQuadrant] = useState(1);
  const [mouseSelection, setMouseSelection] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  const canvasScale = useCanvasStore.use.canvasScale();
  const hiddenElementIdList = useCanvasStore.use.hiddenElementIdList();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const ctrlOrShiftKeyActive = useKeyboardStore((state) => state.ctrlOrShiftKeyActive());

  // 更新鼠标选区范围
  const updateMouseSelection = useCallback(
    (e: React.MouseEvent) => {
      if (!viewportRef.current) return;

      let isMouseDown = true;
      const viewportRect = viewportRef.current.getBoundingClientRect();

      const minSelectionRange = 5;

      const startPageX = e.pageX;
      const startPageY = e.pageY;

      const left = (startPageX - viewportRect.x) / canvasScale;
      const top = (startPageY - viewportRect.y) / canvasScale;

      // 初始化选区起始位置和默认值
      setMouseSelection({
        top: top,
        left: left,
        width: 0,
        height: 0,
      });
      setMouseSelectionVisible(false);
      setMouseSelectionQuadrant(4);

      const handleMouseMove = (e: MouseEvent) => {
        if (!isMouseDown) return;

        const currentPageX = e.pageX;
        const currentPageY = e.pageY;

        const offsetWidth = (currentPageX - startPageX) / canvasScale;
        const offsetHeight = (currentPageY - startPageY) / canvasScale;

        const width = Math.abs(offsetWidth);
        const height = Math.abs(offsetHeight);

        if (width < minSelectionRange || height < minSelectionRange) return;

        // 确定鼠标选区（移动）方向
        // 按象限位置分类，例如右下为第4象限
        let quadrant = 0;
        if (offsetWidth > 0 && offsetHeight > 0) quadrant = 4;
        else if (offsetWidth < 0 && offsetHeight < 0) quadrant = 2;
        else if (offsetWidth > 0 && offsetHeight < 0) quadrant = 1;
        else if (offsetWidth < 0 && offsetHeight > 0) quadrant = 3;

        // 更新选区范围
        setMouseSelection((prev) => ({
          ...prev,
          width: width,
          height: height,
        }));
        setMouseSelectionVisible(true);
        setMouseSelectionQuadrant(quadrant);
      };

      const handleMouseUp = () => {
        document.onmousemove = null;
        document.onmouseup = null;
        isMouseDown = false;

        // 检查哪些画布元素在鼠标选区范围内并将它们设为选中
        let inRangeElementList: PPTElement[] = [];
        for (const element of elementListRef.current) {
          const mouseSelectionLeft = mouseSelection.left;
          const mouseSelectionTop = mouseSelection.top;
          const mouseSelectionWidth = mouseSelection.width;
          const mouseSelectionHeight = mouseSelection.height;

          const { minX, maxX, minY, maxY } = getElementRange(element);

          // 每个象限方向的包含检查不同
          let isInclude = false;
          if (ctrlOrShiftKeyActive) {
            if (mouseSelectionQuadrant === 4) {
              isInclude =
                maxX > mouseSelectionLeft &&
                minX < mouseSelectionLeft + mouseSelectionWidth &&
                maxY > mouseSelectionTop &&
                minY < mouseSelectionTop + mouseSelectionHeight;
            } else if (mouseSelectionQuadrant === 2) {
              isInclude =
                maxX > mouseSelectionLeft - mouseSelectionWidth &&
                minX < mouseSelectionLeft - mouseSelectionWidth + mouseSelectionWidth &&
                maxY > mouseSelectionTop - mouseSelectionHeight &&
                minY < mouseSelectionTop - mouseSelectionHeight + mouseSelectionHeight;
            } else if (mouseSelectionQuadrant === 1) {
              isInclude =
                maxX > mouseSelectionLeft &&
                minX < mouseSelectionLeft + mouseSelectionWidth &&
                maxY > mouseSelectionTop - mouseSelectionHeight &&
                minY < mouseSelectionTop - mouseSelectionHeight + mouseSelectionHeight;
            } else if (mouseSelectionQuadrant === 3) {
              isInclude =
                maxX > mouseSelectionLeft - mouseSelectionWidth &&
                minX < mouseSelectionLeft - mouseSelectionWidth + mouseSelectionWidth &&
                maxY > mouseSelectionTop &&
                minY < mouseSelectionTop + mouseSelectionHeight;
            }
          } else {
            if (mouseSelectionQuadrant === 4) {
              isInclude =
                minX > mouseSelectionLeft &&
                maxX < mouseSelectionLeft + mouseSelectionWidth &&
                minY > mouseSelectionTop &&
                maxY < mouseSelectionTop + mouseSelectionHeight;
            } else if (mouseSelectionQuadrant === 2) {
              isInclude =
                minX > mouseSelectionLeft - mouseSelectionWidth &&
                maxX < mouseSelectionLeft - mouseSelectionWidth + mouseSelectionWidth &&
                minY > mouseSelectionTop - mouseSelectionHeight &&
                maxY < mouseSelectionTop - mouseSelectionHeight + mouseSelectionHeight;
            } else if (mouseSelectionQuadrant === 1) {
              isInclude =
                minX > mouseSelectionLeft &&
                maxX < mouseSelectionLeft + mouseSelectionWidth &&
                minY > mouseSelectionTop - mouseSelectionHeight &&
                maxY < mouseSelectionTop - mouseSelectionHeight + mouseSelectionHeight;
            } else if (mouseSelectionQuadrant === 3) {
              isInclude =
                minX > mouseSelectionLeft - mouseSelectionWidth &&
                maxX < mouseSelectionLeft - mouseSelectionWidth + mouseSelectionWidth &&
                minY > mouseSelectionTop &&
                maxY < mouseSelectionTop + mouseSelectionHeight;
            }
          }

          // 锁定或隐藏的元素即使在范围内也不应被选中
          if (isInclude && !element.lock && !hiddenElementIdList.includes(element.id))
            inRangeElementList.push(element);
        }

        // 如果组合元素在范围内，该组合的所有成员都必须在范围内才能被选中
        inRangeElementList = inRangeElementList.filter((inRangeElement) => {
          if (inRangeElement.groupId) {
            const inRangeElementIdList = inRangeElementList.map(
              (inRangeElement) => inRangeElement.id,
            );
            const groupElementList = elementListRef.current.filter(
              (element) => element.groupId === inRangeElement.groupId,
            );
            return groupElementList.every((groupElement) =>
              inRangeElementIdList.includes(groupElement.id),
            );
          }
          return true;
        });
        const inRangeElementIdList = inRangeElementList.map((inRangeElement) => inRangeElement.id);
        setActiveElementIdList(inRangeElementIdList);

        setMouseSelectionVisible(false);
      };

      document.onmousemove = handleMouseMove;
      document.onmouseup = handleMouseUp;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意排除 mouseSelection 状态以避免无限重建
    [
      viewportRef,
      canvasScale,
      ctrlOrShiftKeyActive,
      hiddenElementIdList,
      elementListRef,
      setActiveElementIdList,
    ],
  );

  return {
    mouseSelection,
    mouseSelectionVisible,
    mouseSelectionQuadrant,
    updateMouseSelection,
  };
}
