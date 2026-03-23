import type { PPTElement } from '@/lib/types/slides';

export function useOrderElement() {
  /**
   * 获取分组元素的 z 轴顺序范围
   * @param elementList 页面上的所有元素
   * @param combineElementList 分组元素列表
   */
  const getCombineElementLevelRange = (
    elementList: PPTElement[],
    combineElementList: PPTElement[],
  ) => {
    return {
      minLevel: elementList.findIndex((_element) => _element.id === combineElementList[0].id),
      maxLevel: elementList.findIndex(
        (_element) => _element.id === combineElementList[combineElementList.length - 1].id,
      ),
    };
  };

  /**
   * 上移一层
   * @param elementList 页面上的所有元素
   * @param element 正在操作的元素
   */
  const moveUpElement = (elementList: PPTElement[], element: PPTElement) => {
    const copyOfElementList: PPTElement[] = JSON.parse(JSON.stringify(elementList));

    // 如果元素是分组成员，所有分组成员必须一起移动
    if (element.groupId) {
      // 获取所有分组成员及其 z 轴顺序范围
      const combineElementList = copyOfElementList.filter(
        (_element) => _element.groupId === element.groupId,
      );
      const { minLevel, maxLevel } = getCombineElementLevelRange(elementList, combineElementList);

      // 已在顶层，无法继续移动
      const nextElement = copyOfElementList[maxLevel + 1];
      const movedElementList = copyOfElementList.splice(minLevel, combineElementList.length);

      if (nextElement.groupId) {
        const nextCombineElementList = copyOfElementList.filter(
          (_element) => _element.groupId === nextElement.groupId,
        );
        copyOfElementList.splice(minLevel + nextCombineElementList.length, 0, ...movedElementList);
      } else copyOfElementList.splice(minLevel + 1, 0, ...movedElementList);
    }

    // 如果元素不是分组成员
    else {
      // 获取元素在列表中的 z 轴层级
      const level = elementList.findIndex((item) => item.id === element.id);

      // 已在顶层，无法继续移动
      if (level === elementList.length - 1) return;

      // 获取上方的元素，从列表中移除此元素（缓存移除的元素）。
      // 如果上方元素在分组中，插入到该分组上方。
      // 如果上方元素不在任何分组中，插入到该元素上方。
      const nextElement = copyOfElementList[level + 1];
      const [movedElement] = copyOfElementList.splice(level, 1);
      if (nextElement.groupId) {
        const combineElementList = copyOfElementList.filter(
          (_element) => _element.groupId === nextElement.groupId,
        );
        copyOfElementList.splice(level + combineElementList.length, 0, movedElement);
      } else copyOfElementList.splice(level + 1, 0, movedElement);
    }

    return copyOfElementList;
  };

  /**
   * 下移一层，与上移方法相同
   * @param elementList 页面上的所有元素
   * @param element 正在操作的元素
   */
  const moveDownElement = (elementList: PPTElement[], element: PPTElement) => {
    const copyOfElementList: PPTElement[] = JSON.parse(JSON.stringify(elementList));

    if (element.groupId) {
      const combineElementList = copyOfElementList.filter(
        (_element) => _element.groupId === element.groupId,
      );
      const { minLevel } = getCombineElementLevelRange(elementList, combineElementList);
      if (minLevel === 0) return;

      const prevElement = copyOfElementList[minLevel - 1];
      const movedElementList = copyOfElementList.splice(minLevel, combineElementList.length);

      if (prevElement.groupId) {
        const prevCombineElementList = copyOfElementList.filter(
          (_element) => _element.groupId === prevElement.groupId,
        );
        copyOfElementList.splice(minLevel - prevCombineElementList.length, 0, ...movedElementList);
      } else copyOfElementList.splice(minLevel - 1, 0, ...movedElementList);
    } else {
      const level = elementList.findIndex((item) => item.id === element.id);
      if (level === 0) return;

      const prevElement = copyOfElementList[level - 1];
      const movedElement = copyOfElementList.splice(level, 1)[0];

      if (prevElement.groupId) {
        const combineElementList = copyOfElementList.filter(
          (_element) => _element.groupId === prevElement.groupId,
        );
        copyOfElementList.splice(level - combineElementList.length, 0, movedElement);
      } else copyOfElementList.splice(level - 1, 0, movedElement);
    }

    return copyOfElementList;
  };

  /**
   * 置于顶层
   * @param elementList 页面上的所有元素
   * @param element 正在操作的元素
   */
  const moveTopElement = (elementList: PPTElement[], element: PPTElement) => {
    const copyOfElementList: PPTElement[] = JSON.parse(JSON.stringify(elementList));

    // 如果元素是分组成员，所有分组成员必须一起移动
    if (element.groupId) {
      // 获取所有分组成员及其 z 轴顺序范围
      const combineElementList = copyOfElementList.filter(
        (_element) => _element.groupId === element.groupId,
      );
      const { minLevel, maxLevel } = getCombineElementLevelRange(elementList, combineElementList);

      // 已在顶层，无法继续移动
      if (maxLevel === elementList.length - 1) return null;

      // 从列表中移除分组，然后将移除的元素追加到顶部
      const movedElementList = copyOfElementList.splice(minLevel, combineElementList.length);
      copyOfElementList.push(...movedElementList);
    }

    // 如果元素不是分组成员
    else {
      // 获取元素在列表中的 z 轴层级
      const level = elementList.findIndex((item) => item.id === element.id);

      // 已在顶层，无法继续移动
      if (level === elementList.length - 1) return null;

      // 从列表中移除元素，然后将其追加到顶部
      copyOfElementList.splice(level, 1);
      copyOfElementList.push(element);
    }

    return copyOfElementList;
  };

  /**
   * 置于底层，与置于顶层方法相同
   * @param elementList 页面上的所有元素
   * @param element 正在操作的元素
   */
  const moveBottomElement = (elementList: PPTElement[], element: PPTElement) => {
    const copyOfElementList: PPTElement[] = JSON.parse(JSON.stringify(elementList));

    if (element.groupId) {
      const combineElementList = copyOfElementList.filter(
        (_element) => _element.groupId === element.groupId,
      );
      const { minLevel } = getCombineElementLevelRange(elementList, combineElementList);
      if (minLevel === 0) return;

      const movedElementList = copyOfElementList.splice(minLevel, combineElementList.length);
      copyOfElementList.unshift(...movedElementList);
    } else {
      const level = elementList.findIndex((item) => item.id === element.id);
      if (level === 0) return;

      copyOfElementList.splice(level, 1);
      copyOfElementList.unshift(element);
    }

    return copyOfElementList;
  };

  return {
    moveUpElement,
    moveDownElement,
    moveTopElement,
    moveBottomElement,
  };
}
