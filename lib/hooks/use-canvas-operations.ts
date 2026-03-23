/**
 * 画布元素操作 Hook
 *
 * 提供便捷的元素 CRUD 方法，避免在每个组件中重复定义
 *
 * @example
 * function MyComponent() {
 *   const { addElement, updateElement, deleteElement } = useCanvasOperations();
 *
 *   const handleAdd = () => {
 *     addElement({
 *       id: 'new-1',
 *       type: 'text',
 *       // ...
 *     });
 *   };
 * }
 */

import { useSceneData, useSceneSelector } from '@/lib/contexts/scene-context';
import {
  useCanvasStore,
  type SpotlightOptions,
  type HighlightOverlayOptions,
} from '@/lib/store/canvas';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, Slide } from '@/lib/types/slides';
import { useCallback, useMemo } from 'react';
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';
import { toast } from 'sonner';
import { ElementAlignCommands, ElementOrderCommands } from '@/lib/types/edit';
import { getElementListRange } from '@/lib/utils/element';
import { useOrderElement } from './use-order-element';
import { nanoid } from 'nanoid';

type PPTElementKey = keyof PPTElement;

interface RemovePropData {
  id: string;
  propName: PPTElementKey | PPTElementKey[];
}

interface UpdateElementData {
  id: string | string[];
  props: Partial<PPTElement>;
  slideId?: string;
}

export function useCanvasOperations() {
  const { updateSceneData } = useSceneData<SlideContent>();
  const currentSlide = useSceneSelector<SlideContent, Slide>((content) => content.canvas);

  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeElementList = useMemo(
    () => currentSlide.elements.filter((el) => activeElementIdList.includes(el.id)),
    [currentSlide.elements, activeElementIdList],
  );
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const handleElementId = useCanvasStore.use.handleElementId();
  const hiddenElementIdList = useCanvasStore.use.hiddenElementIdList();

  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();

  const _setEditorareaFocus = useCanvasStore.use.setEditorAreaFocus();

  const { addHistorySnapshot } = useHistorySnapshot();
  const { moveUpElement, moveDownElement, moveTopElement, moveBottomElement } = useOrderElement();

  /**
   * 添加元素
   * @param element 单个元素或元素数组
   * @param autoSelect 是否自动选中新添加的元素（默认 true）
   */
  const addElement = useCallback(
    (element: PPTElement | PPTElement[], autoSelect = true) => {
      const elements = Array.isArray(element) ? element : [element];

      updateSceneData((draft) => {
        draft.canvas.elements.push(...elements);
      });

      // 自动选中新添加的元素
      if (autoSelect) {
        const newIds = elements.map((el) => el.id);
        setActiveElementIdList(newIds);
      }
    },
    [updateSceneData, setActiveElementIdList],
  );

  // 删除所有选中的元素
  // 如果分组成员被选中进行独立操作，首先删除该元素。否则删除所有选中的元素。
  // 如果提供了 elementId，只删除该元素
  const deleteElement = (elementId?: string) => {
    let newElementList: PPTElement[] = [];

    if (elementId) {
      // 删除指定元素
      newElementList = currentSlide.elements.filter((el) => el.id !== elementId);
      setActiveElementIdList(activeElementIdList.filter((id) => id !== elementId));
    } else {
      // 原始逻辑：删除选中的元素
      if (!activeElementIdList.length) return;

      if (activeGroupElementId) {
        newElementList = currentSlide.elements.filter((el) => el.id !== activeGroupElementId);
      } else {
        newElementList = currentSlide.elements.filter((el) => !activeElementIdList.includes(el.id));
      }
      setActiveElementIdList([]);
    }

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  // 删除页面上的所有元素（无论是否选中）
  const deleteAllElements = () => {
    if (!currentSlide.elements.length) return;
    setActiveElementIdList([]);
    updateSlide({ elements: [] });
    addHistorySnapshot();
  };

  /**
   * 更新元素属性
   * @param props 要更新的属性
   */
  const updateElement = useCallback(
    (data: UpdateElementData) => {
      const { id, props } = data;
      const elementIds = Array.isArray(id) ? id : [id];

      updateSceneData((draft) => {
        draft.canvas.elements.forEach((el) => {
          if (elementIds.includes(el.id)) {
            Object.assign(el, props);
          }
        });
      });
    },
    [updateSceneData],
  );

  /**
   * 更新幻灯片内容
   */
  const updateSlide = useCallback(
    (props: Partial<Slide>) => {
      updateSceneData((draft) => {
        Object.assign(draft.canvas, props);
      });
    },
    [updateSceneData],
  );

  /**
   * 移除元素属性
   */
  const removeElementProps = useCallback(
    (data: RemovePropData) => {
      const { id, propName } = data;
      const elementIds = Array.isArray(id) ? id : [id];
      const propNames = Array.isArray(propName) ? propName : [propName];

      updateSceneData((draft) => {
        draft.canvas.elements.forEach((el) => {
          if (elementIds.includes(el.id)) {
            propNames.forEach((name) => {
              delete el[name];
            });
          }
        });
      });
    },
    [updateSceneData],
  );

  // 复制选中的元素数据到剪贴板
  const copyElement = () => {
    // if (!activeElementIdList.length) return

    // const text = JSON.stringify({
    //   type: 'elements',
    //   data: activeElementList,
    // })

    // copyText(text).then(() => {
    //   setEditorareaFocus(true)
    // })
    toast.warning('Not implemented');
  };

  // 复制并删除选中的元素（剪切）
  const cutElement = () => {
    // copyElement()
    // deleteElement()
    toast.warning('Not implemented');
  };

  // 尝试从剪贴板粘贴元素数据
  const pasteElement = () => {
    // readClipboard().then(text => {
    //   pasteTextClipboardData(text)
    // }).catch(err => toast.warning(err))
    toast.warning('Not implemented');
  };

  // 复制并立即粘贴选中的元素
  const _quickCopyElement = () => {
    copyElement();
    pasteElement();
  };

  // 锁定选中的元素并清除选择状态
  const lockElement = () => {
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id)) element.lock = true;
    }
    updateSlide({ elements: newElementList });
    setActiveElementIdList([]);
    addHistorySnapshot();
  };

  /**
   * 解锁元素并将其设为当前选择
   * @param handleElement 要解锁的元素
   */
  const unlockElement = (handleElement: PPTElement) => {
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    if (handleElement.groupId) {
      const groupElementIdList = [];
      for (const element of newElementList) {
        if (element.groupId === handleElement.groupId) {
          element.lock = false;
          groupElementIdList.push(element.id);
        }
      }
      updateSlide({ elements: newElementList });
      setActiveElementIdList(groupElementIdList);
    } else {
      for (const element of newElementList) {
        if (element.id === handleElement.id) {
          element.lock = false;
          break;
        }
      }
      updateSlide({ elements: newElementList });
      setActiveElementIdList([handleElement.id]);
    }
    addHistorySnapshot();
  };

  // 选择当前页面上的所有元素
  const selectAllElements = () => {
    const unlockedElements = currentSlide.elements.filter(
      (el) => !el.lock && !hiddenElementIdList.includes(el.id),
    );
    const newActiveElementIdList = unlockedElements.map((el) => el.id);
    setActiveElementIdList(newActiveElementIdList);
  };

  // 选择特定元素
  const selectElement = (id: string) => {
    if (handleElementId === id) return;
    if (hiddenElementIdList.includes(id)) return;

    const lockedElements = currentSlide.elements.filter((el) => el.lock);
    if (lockedElements.some((el) => el.id === id)) return;

    setActiveElementIdList([id]);
  };

  /**
   * 将所有选中元素对齐到画布
   * @param command 对齐方向
   */
  const alignElementToCanvas = (command: ElementAlignCommands) => {
    const viewportWidth = viewportSize;
    const viewportHeight = viewportSize * viewportRatio;
    const { minX, maxX, minY, maxY } = getElementListRange(activeElementList);

    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));
    for (const element of newElementList) {
      if (!activeElementIdList.includes(element.id)) continue;

      // 水平和垂直居中
      if (command === ElementAlignCommands.CENTER) {
        const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
        const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
        element.top = element.top - offsetY;
        element.left = element.left - offsetX;
      }

      // 顶部对齐
      if (command === ElementAlignCommands.TOP) {
        const offsetY = minY - 0;
        element.top = element.top - offsetY;
      }

      // 垂直居中
      else if (command === ElementAlignCommands.VERTICAL) {
        const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
        element.top = element.top - offsetY;
      }

      // 底部对齐
      else if (command === ElementAlignCommands.BOTTOM) {
        const offsetY = maxY - viewportHeight;
        element.top = element.top - offsetY;
      }

      // 左对齐
      else if (command === ElementAlignCommands.LEFT) {
        const offsetX = minX - 0;
        element.left = element.left - offsetX;
      }

      // 水平居中
      else if (command === ElementAlignCommands.HORIZONTAL) {
        const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
        element.left = element.left - offsetX;
      }

      // 右对齐
      else if (command === ElementAlignCommands.RIGHT) {
        const offsetX = maxX - viewportWidth;
        element.left = element.left - offsetX;
      }
    }

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  /**
   * 调整元素 z 轴顺序
   * @param element 要重排的元素
   * @param command 重排命令：上移、下移、置于顶层、置于底层
   */
  const orderElement = (element: PPTElement, command: ElementOrderCommands) => {
    let newElementList;

    if (command === ElementOrderCommands.UP)
      newElementList = moveUpElement(currentSlide.elements, element);
    else if (command === ElementOrderCommands.DOWN)
      newElementList = moveDownElement(currentSlide.elements, element);
    else if (command === ElementOrderCommands.TOP)
      newElementList = moveTopElement(currentSlide.elements, element);
    else if (command === ElementOrderCommands.BOTTOM)
      newElementList = moveBottomElement(currentSlide.elements, element);

    if (!newElementList) return;

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  /**
   * 检查当前选中的元素是否可以分组
   */
  const _canCombine = useMemo(() => {
    if (activeElementList.length < 2) return false;

    const firstGroupId = activeElementList[0].groupId;
    if (!firstGroupId) return true;

    const inSameGroup = activeElementList.every(
      (el) => (el.groupId && el.groupId) === firstGroupId,
    );
    return !inSameGroup;
  }, [activeElementList]);

  /**
   * 将当前选中的元素分组：为所有选中元素分配相同的分组 ID
   */
  const combineElements = () => {
    if (!activeElementList.length) return;

    // 创建新的元素列表用于后续操作
    let newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    // 生成分组 ID
    const groupId = nanoid(10);

    // 收集要分组的元素并分配唯一的分组 ID
    const combineElementList: PPTElement[] = [];
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id)) {
        element.groupId = groupId;
        combineElementList.push(element);
      }
    }

    // 确保所有分组成员具有连续的 z 轴层级：
    // 首先找到 z 轴层级最高的成员，从元素列表中移除所有分组成员，
    // 然后根据最高层级将收集的分组成员插入到适当位置
    const combineElementMaxLevel = newElementList.findIndex(
      (_element) => _element.id === combineElementList[combineElementList.length - 1].id,
    );
    const combineElementIdList = combineElementList.map((_element) => _element.id);
    newElementList = newElementList.filter(
      (_element) => !combineElementIdList.includes(_element.id),
    );

    const insertLevel = combineElementMaxLevel - combineElementList.length + 1;
    newElementList.splice(insertLevel, 0, ...combineElementList);

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  /**
   * 取消元素分组：从选中的元素中移除分组 ID
   */
  const uncombineElements = () => {
    if (!activeElementList.length) return;
    const hasElementInGroup = activeElementList.some((item) => item.groupId);
    if (!hasElementInGroup) return;

    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id) && element.groupId) delete element.groupId;
    }
    updateSlide({ elements: newElementList });

    // 取消分组后，重置活动元素状态
    // 默认为当前处理的元素，如果不存在则为空
    const handleElementIdList = handleElementId ? [handleElementId] : [];
    setActiveElementIdList(handleElementIdList);

    addHistorySnapshot();
  };

  /**
   * 更新背景
   * @param background 新的背景设置
   */
  const updateBackground = useCallback(
    (background: SlideContent['canvas']['background']) => {
      updateSceneData((draft) => {
        draft.canvas.background = background;
      });
    },
    [updateSceneData],
  );

  /**
   * 更新主题
   * @param theme 主题设置（部分）
   */
  const updateTheme = useCallback(
    (theme: Partial<SlideContent['canvas']['theme']>) => {
      updateSceneData((draft) => {
        draft.canvas.theme = {
          ...draft.canvas.theme,
          ...theme,
        };
      });
    },
    [updateSceneData],
  );

  /**
   * 聚光灯聚焦元素
   * @param elementId 元素 ID
   * @param options 聚光灯选项
   */
  const spotlightElement = useCallback((elementId: string, options?: SpotlightOptions) => {
    useCanvasStore.getState().setSpotlight(elementId, options);
  }, []);

  /**
   * 清除聚光灯
   */
  const clearSpotlight = useCallback(() => {
    useCanvasStore.getState().clearSpotlight();
  }, []);

  /**
   * 高亮元素
   * @param elementIds 元素 ID 列表
   * @param options 高亮选项
   */
  const highlightElements = useCallback(
    (elementIds: string[], options?: HighlightOverlayOptions) => {
      useCanvasStore.getState().setHighlight(elementIds, options);
    },
    [],
  );

  /**
   * 清除高亮
   */
  const clearHighlight = useCallback(() => {
    useCanvasStore.getState().clearHighlight();
  }, []);

  /**
   * 激光笔效果
   * @param elementId 元素 ID
   * @param options 激光笔选项
   */
  const laserElement = useCallback(
    (elementId: string, options?: { color?: string; duration?: number }) => {
      useCanvasStore.getState().setLaser(elementId, options);
    },
    [],
  );

  /**
   * 清除激光笔
   */
  const clearLaser = useCallback(() => {
    useCanvasStore.getState().clearLaser();
  }, []);

  /**
   * 缩放元素
   * @param elementId 元素 ID
   * @param scale 缩放比例
   */
  const zoomElement = useCallback((elementId: string, scale: number) => {
    useCanvasStore.getState().setZoom(elementId, scale);
  }, []);

  /**
   * 清除缩放
   */
  const clearZoom = useCallback(() => {
    useCanvasStore.getState().clearZoom();
  }, []);

  /**
   * 清除所有教学效果（聚光灯 + 高亮 + 激光笔 + 缩放）
   */
  const clearAllEffects = useCallback(() => {
    useCanvasStore.getState().clearSpotlight();
    useCanvasStore.getState().clearHighlight();
    useCanvasStore.getState().clearLaser();
    useCanvasStore.getState().clearZoom();
  }, []);

  return {
    // 基础操作
    addElement,
    deleteElement,
    deleteAllElements,
    updateElement,
    updateSlide,
    removeElementProps,
    copyElement,
    pasteElement,
    cutElement,

    // 高级操作
    lockElement,
    unlockElement,
    selectAllElements,
    selectElement,
    alignElementToCanvas,
    orderElement,
    combineElements,
    uncombineElements,

    // 画布操作
    updateBackground,
    updateTheme,

    // 教学功能
    spotlightElement,
    clearSpotlight,
    highlightElements,
    clearHighlight,
    laserElement,
    clearLaser,
    zoomElement,
    clearZoom,
    clearAllEffects,
  };
}

// 导出类型
export type CanvasOperations = ReturnType<typeof useCanvasOperations>;
