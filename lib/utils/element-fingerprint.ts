import type { PPTElement } from '@/lib/types/slides';

/**
 * 提取每种元素类型的语义内容。
 * 由 elementFingerprint 用于检测仅内容变更
 * （相同 id/位置但文本、图表数据、媒体 src 等不同）。
 */
function semanticPart(e: PPTElement): unknown {
  switch (e.type) {
    case 'text':
      return { content: e.content };
    case 'image':
      return { src: e.src };
    case 'shape':
      return {
        path: e.path,
        fill: e.fill,
        text: e.text?.content ?? '',
        gradient: e.gradient ?? null,
        pattern: e.pattern ?? null,
      };
    case 'line':
      return {
        start: e.start,
        end: e.end,
        color: e.color,
        style: e.style,
        points: e.points,
      };
    case 'chart':
      return {
        chartType: e.chartType,
        data: e.data,
        themeColors: e.themeColors,
      };
    case 'table':
      return {
        data: e.data.map((row) => row.map((c) => c.text)),
        colWidths: e.colWidths,
        theme: e.theme ?? null,
      };
    case 'latex':
      return { latex: e.latex };
    case 'video':
      return { src: e.src, poster: e.poster ?? '' };
    case 'audio':
      return { src: e.src };
    default: {
      const exhaustiveCheck: never = e;
      return exhaustiveCheck;
    }
  }
}

/**
 * 为白板元素列表生成指纹字符串。
 * 用于历史快照中的变更检测和去重。
 *
 * 通过结构化的 JSON.stringify 同时覆盖几何信息（id、位置、大小）和语义内容
 * — 避免了手动拼接字符串在处理富文本 HTML 内容时可能出现的分隔符冲突问题。
 */
export function elementFingerprint(els: PPTElement[]): string {
  return JSON.stringify(
    els.map((e) => ({
      id: e.id,
      left: e.left ?? 0,
      top: e.top ?? 0,
      width: 'width' in e ? e.width : 0,
      height: 'height' in e && e.height != null ? e.height : 0,
      sem: semanticPart(e),
    })),
  );
}
