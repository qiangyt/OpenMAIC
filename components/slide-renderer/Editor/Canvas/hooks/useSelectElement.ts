import { useCallback } from 'react';
import { uniq } from 'lodash';
import { useCanvasStore } from '@/lib/store';
import { useKeyboardStore } from '@/lib/store/keyboard';
import type { PPTElement } from '@/lib/types/slides';

/**
 * 处理画布中元素选择的 Hook
 * 支持单选、多选（Ctrl/Shift）和组合选择
 */
export function useSelectElement(
  elementListRef: React.RefObject<PPTElement[]>,
  moveElement: (e: React.MouseEvent | React.TouchEvent, element: PPTElement) => void,
) {
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const handleElementId = useCanvasStore.use.handleElementId();
  const editorAreaFocus = useCanvasStore.use.editorAreaFocus();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const setHandleElementId = useCanvasStore.use.setHandleElementId();
  const setActiveGroupElementId = useCanvasStore.use.setActiveGroupElementId();
  const setEditorAreaFocus = useCanvasStore.use.setEditorAreaFocus();

  const ctrlOrShiftKeyActive = useKeyboardStore((state) => state.ctrlOrShiftKeyActive());

  // 选择元素
  // startMove 表示选择后是否进入移动状态
  const selectElement = useCallback(
    (e: React.MouseEvent | React.TouchEvent, element: PPTElement, startMove = true) => {
      if (!editorAreaFocus) setEditorAreaFocus(true);

      // 如果目标元素当前未被选中，将其设为选中
      // 如果按住 Ctrl 或 Shift，进入多选模式：将目标添加到当前选择；否则仅选择目标
      // 如果目标是组合成员，同时选择该组合的其他成员
      if (!activeElementIdList.includes(element.id)) {
        let newActiveIdList: string[] = [];

        if (ctrlOrShiftKeyActive) {
          newActiveIdList = [...activeElementIdList, element.id];
        } else {
          newActiveIdList = [element.id];
        }

        if (element.groupId) {
          const groupMembersId: string[] = [];
          elementListRef.current.forEach((el: PPTElement) => {
            if (el.groupId === element.groupId) groupMembersId.push(el.id);
          });
          newActiveIdList = [...newActiveIdList, ...groupMembersId];
        }

        setActiveElementIdList(uniq(newActiveIdList));
        setHandleElementId(element.id);
      }

      // 如果目标元素已被选中且按住 Ctrl/Shift，则取消选择
      // 除非它是最后一个选中元素，或它所属的组合是最后一个选中组合
      // 如果目标是组合成员，同时取消选择该组合的其他成员
      else if (ctrlOrShiftKeyActive) {
        let newActiveIdList: string[] = [];

        if (element.groupId) {
          const groupMembersId: string[] = [];
          elementListRef.current.forEach((el: PPTElement) => {
            if (el.groupId === element.groupId) groupMembersId.push(el.id);
          });
          newActiveIdList = activeElementIdList.filter((id) => !groupMembersId.includes(id));
        } else {
          newActiveIdList = activeElementIdList.filter((id) => id !== element.id);
        }

        if (newActiveIdList.length > 0) {
          setActiveElementIdList(newActiveIdList);
        }
      }

      // 如果目标已被选中但不是当前操作元素，将其设为操作元素
      else if (handleElementId !== element.id) {
        setHandleElementId(element.id);
      }

      // 如果目标已是操作元素，再次点击将其设为活动组元素
      else if (activeGroupElementId !== element.id) {
        const startPageX =
          e.nativeEvent instanceof MouseEvent
            ? e.nativeEvent.pageX
            : 'changedTouches' in e
              ? e.changedTouches[0].pageX
              : 0;
        const startPageY =
          e.nativeEvent instanceof MouseEvent
            ? e.nativeEvent.pageY
            : 'changedTouches' in e
              ? e.changedTouches[0].pageY
              : 0;

        const target = e.target as HTMLElement;
        const handleMouseUp = (e: MouseEvent) => {
          const currentPageX = e.pageX;
          const currentPageY = e.pageY;

          if (startPageX === currentPageX && startPageY === currentPageY) {
            setActiveGroupElementId(element.id);
            target.onmouseup = null;
          }
        };

        target.onmouseup = handleMouseUp;
      }

      if (startMove) moveElement(e, element);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意排除 elementListRef（稳定引用）以避免无限重建
    [
      editorAreaFocus,
      activeElementIdList,
      ctrlOrShiftKeyActive,
      handleElementId,
      activeGroupElementId,
      setEditorAreaFocus,
      setActiveElementIdList,
      setHandleElementId,
      setActiveGroupElementId,
      moveElement,
    ],
  );

  return {
    selectElement,
  };
}
