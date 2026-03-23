import type { CSSProperties } from 'react';
import type { TableCell, TableCellStyle } from '@/lib/types/slides';

/**
 * 将 TableCellStyle 转换为 CSS 属性
 */
export function getTextStyle(style?: TableCellStyle): CSSProperties {
  if (!style) return {};

  const css: CSSProperties = {};

  if (style.bold) css.fontWeight = 'bold';
  if (style.em) css.fontStyle = 'italic';
  if (style.underline) css.textDecoration = 'underline';
  if (style.strikethrough) {
    css.textDecoration = css.textDecoration ? `${css.textDecoration} line-through` : 'line-through';
  }
  if (style.color) css.color = style.color;
  if (style.backcolor) css.backgroundColor = style.backcolor;
  if (style.fontsize) css.fontSize = style.fontsize;
  if (style.fontname) css.fontFamily = style.fontname;
  if (style.align) css.textAlign = style.align;

  return css;
}

/**
 * 格式化文本：将 \n 转换为 <br/>，将空格转换为 &nbsp;
 */
export function formatText(text: string): string {
  return text.replace(/\n/g, '<br/>').replace(/ /g, '&nbsp;');
}

/**
 * 根据 colspan/rowspan 合并计算隐藏单元格位置。
 * 返回应隐藏单元格的 "row_col" 键集合。
 */
export function getHiddenCells(data: TableCell[][]): Set<string> {
  const hidden = new Set<string>();

  for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
    let realColIdx = 0;
    for (let colIdx = 0; colIdx < data[rowIdx].length; colIdx++) {
      // 跳过已被之前合并占据的位置
      while (hidden.has(`${rowIdx}_${realColIdx}`)) {
        realColIdx++;
      }

      const cell = data[rowIdx][colIdx];
      const colspan = cell.colspan ?? 1;
      const rowspan = cell.rowspan ?? 1;

      if (colspan > 1 || rowspan > 1) {
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            if (r === 0 && c === 0) continue;
            hidden.add(`${rowIdx + r}_${realColIdx + c}`);
          }
        }
      }

      realColIdx += colspan;
    }
  }

  return hidden;
}
