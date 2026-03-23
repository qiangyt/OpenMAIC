'use client';

import type { PPTChartElement } from '@/lib/types/slides';
import { ElementOutline } from '../ElementOutline';
import { Chart } from './Chart';

export { BaseChartElement } from './BaseChartElement';

export interface ChartElementProps {
  elementInfo: PPTChartElement;
  selectElement?: (e: React.MouseEvent | React.TouchEvent, element: PPTChartElement) => void;
}

/**
 * 图表元素组件
 * 使用 ECharts 渲染交互式图表
 */
export function ChartElement({ elementInfo, selectElement }: ChartElementProps) {
  const handleSelectElement = (e: React.MouseEvent | React.TouchEvent) => {
    if (elementInfo.lock) return;
    e.stopPropagation();
    selectElement?.(e, elementInfo);
  };

  return (
    <div
      className={`editable-element-chart absolute ${elementInfo.lock ? 'lock' : ''}`}
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div
        className="rotate-wrapper w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate}deg)` }}
      >
        <div
          className={`element-content relative w-full h-full overflow-hidden ${
            elementInfo.lock ? 'cursor-default' : 'cursor-move'
          }`}
          style={{
            backgroundColor: elementInfo.fill,
          }}
          onMouseDown={handleSelectElement}
          onTouchStart={handleSelectElement}
        >
          <ElementOutline
            width={elementInfo.width}
            height={elementInfo.height}
            outline={elementInfo.outline}
          />
          <Chart
            width={elementInfo.width}
            height={elementInfo.height}
            type={elementInfo.chartType}
            data={elementInfo.data}
            themeColors={elementInfo.themeColors}
            textColor={elementInfo.textColor}
            lineColor={elementInfo.lineColor}
            options={elementInfo.options}
          />
        </div>
      </div>
    </div>
  );
}
