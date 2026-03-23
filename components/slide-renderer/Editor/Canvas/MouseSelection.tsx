'use client';

export interface MouseSelectionProps {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly quadrant: number;
  readonly canvasScale: number;
}

/**
 * 鼠标选区组件
 * 在鼠标拖拽选区时显示选区矩形
 */
export function MouseSelection({
  top,
  left,
  width,
  height,
  quadrant,
  canvasScale,
}: MouseSelectionProps) {
  const selectionStyle = {
    left: `${(quadrant === 2 || quadrant === 3 ? left - width : left) * canvasScale}px`,
    top: `${(quadrant === 2 || quadrant === 1 ? top - height : top) * canvasScale}px`,
    width: `${width * canvasScale}px`,
    height: `${height * canvasScale}px`,
  };

  return (
    <div
      className="mouse-selection absolute border-2 border-primary border-dashed z-41"
      style={selectionStyle}
    />
  );
}
