'use client';

import { useMemo } from 'react';
import type { PPTTableElement } from '@/lib/types/slides';
import { getTableSubThemeColor } from '@/lib/utils/element';
import { getTextStyle, formatText, getHiddenCells } from './tableUtils';

interface StaticTableProps {
  elementInfo: PPTTableElement;
}

/**
 * 静态表格渲染组件，移植自 PPTist StaticTable.vue
 * 渲染带有主题颜色、边框和合并单元格的表格数据
 */
export function StaticTable({ elementInfo }: StaticTableProps) {
  const { width, data, colWidths, cellMinHeight, outline, theme } = elementInfo;

  const hiddenCells = useMemo(() => getHiddenCells(data), [data]);

  const [subThemeDark, subThemeLight] = useMemo(() => {
    if (!theme) return ['', ''];
    return getTableSubThemeColor(theme.color);
  }, [theme]);

  const borderStyle = useMemo(() => {
    if (!outline) return 'none';
    const w = outline.width ?? 1;
    const c = outline.color ?? '#000';
    const s = outline.style === 'dashed' ? 'dashed' : 'solid';
    return `${w}px ${s} ${c}`;
  }, [outline]);

  /**
   * 根据主题和位置获取单元格背景色
   */
  const getCellBg = (
    rowIdx: number,
    colIdx: number,
    cellBackcolor?: string,
  ): string | undefined => {
    if (cellBackcolor) return cellBackcolor;
    if (!theme) return undefined;

    const rowCount = data.length;
    const colCount = data[0]?.length ?? 0;

    // 行标题（第一行）使用主题色
    if (theme.rowHeader && rowIdx === 0) return theme.color;
    // 行页脚（最后一行）使用主题色
    if (theme.rowFooter && rowIdx === rowCount - 1) return theme.color;
    // 列标题（第一列）使用深色子主题
    if (theme.colHeader && colIdx === 0) return subThemeDark;
    // 列页脚（最后一列）使用深色子主题
    if (theme.colFooter && colIdx === colCount - 1) return subThemeDark;

    // 交替行颜色（计数时跳过标题行）
    const effectiveRow = theme.rowHeader ? rowIdx - 1 : rowIdx;
    if (effectiveRow >= 0 && effectiveRow % 2 === 0) return subThemeLight;

    return undefined;
  };

  /**
   * 获取标题/页脚行的文字颜色（深色背景上使用白色文字）
   */
  const getHeaderTextColor = (rowIdx: number): string | undefined => {
    if (!theme) return undefined;
    const rowCount = data.length;
    if (theme.rowHeader && rowIdx === 0) return '#fff';
    if (theme.rowFooter && rowIdx === rowCount - 1) return '#fff';
    return undefined;
  };

  return (
    <table
      className="w-full h-full"
      style={{
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <colgroup>
        {colWidths.map((w, i) => (
          <col key={i} style={{ width: `${w * width}px` }} />
        ))}
      </colgroup>
      <tbody>
        {data.map((row, rowIdx) => (
          <tr key={rowIdx} style={{ height: `${cellMinHeight}px` }}>
            {row.map((cell, colIdx) => {
              if (hiddenCells.has(`${rowIdx}_${colIdx}`)) return null;

              const bgColor = getCellBg(rowIdx, colIdx, cell.style?.backcolor);
              const headerColor = getHeaderTextColor(rowIdx);
              const textStyle = getTextStyle(cell.style);

              // 只有当单元格没有自己的颜色时，才覆盖标题文字颜色
              if (headerColor && !cell.style?.color) {
                textStyle.color = headerColor;
              }

              return (
                <td
                  key={cell.id}
                  colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                  rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                  style={{
                    border: borderStyle,
                    backgroundColor: bgColor,
                    padding: '5px',
                    verticalAlign: 'middle',
                    wordBreak: 'break-word',
                    ...textStyle,
                  }}
                  dangerouslySetInnerHTML={{ __html: formatText(cell.text) }}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
