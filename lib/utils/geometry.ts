import type { PPTElement } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';

/**
 * 计算元素的百分比坐标（0-100）
 *
 * @param element - PPT 元素
 * @param viewportSize - 视口宽度基准，默认 1000px
 * @returns 百分比几何信息，如果元素没有位置信息则返回 null
 */
export function getElementPercentageGeometry(
  element: PPTElement,
  viewportSize: number = 1000,
): PercentageGeometry | null {
  // 只有已定位的元素才有 left/top/width/height
  if (
    !('left' in element) ||
    !('top' in element) ||
    !('width' in element) ||
    !('height' in element)
  ) {
    return null;
  }

  const { left, top, width, height } = element;

  // 计算百分比坐标（相对于 viewportSize）
  const x = (left / viewportSize) * 100;
  const y = (top / (viewportSize * 0.5625)) * 100; // 16:9 ratio
  const w = (width / viewportSize) * 100;
  const h = (height / (viewportSize * 0.5625)) * 100;

  // 计算中心点
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  return {
    x,
    y,
    w,
    h,
    centerX,
    centerY,
  };
}

/**
 * 根据场景和元素 ID 查找百分比几何信息
 *
 * @param scene - 场景对象
 * @param elementId - 元素 ID
 * @param viewportSize - 视口宽度基准，默认 1000px
 * @returns 百分比几何信息，如果元素未找到或没有位置信息则返回 null
 */
export function findElementGeometry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scene can be old or new format with different shapes
  scene: Record<string, any>,
  elementId: string,
  viewportSize: number = 1000,
): PercentageGeometry | null {
  // 支持两种场景结构：
  // 1. scene.elements（旧格式）
  // 2. scene.content.canvas.elements（新格式）
  let elements: PPTElement[] | undefined;

  if (scene.type === 'slide') {
    if (scene.elements) {
      // 旧格式
      elements = scene.elements;
    } else if (scene.content?.canvas?.elements) {
      // 新格式
      elements = scene.content.canvas.elements;
    }
  }

  if (!elements) {
    return null;
  }

  const element = elements.find((el: PPTElement) => el.id === elementId);
  if (!element) {
    return null;
  }

  return getElementPercentageGeometry(element, viewportSize);
}

/**
 * 计算距离元素中心最近的角落
 *
 * @param geometry - 百分比几何信息
 * @returns 最近角落的坐标 { x: 0-100, y: 0-100 }
 */
export function findNearestCorner(geometry: PercentageGeometry): {
  x: number;
  y: number;
} {
  const { centerX, centerY } = geometry;

  // 四个角落的坐标
  const corners = [
    { x: 0, y: 0 }, // 左上
    { x: 100, y: 0 }, // 右上
    { x: 0, y: 100 }, // 左下
    { x: 100, y: 100 }, // 右下
  ];

  // 计算距离并找到最近的角落
  let minDistance = Infinity;
  let nearestCorner = corners[0];

  for (const corner of corners) {
    const distance = Math.sqrt(Math.pow(corner.x - centerX, 2) + Math.pow(corner.y - centerY, 2));
    if (distance < minDistance) {
      minDistance = distance;
      nearestCorner = corner;
    }
  }

  return nearestCorner;
}
