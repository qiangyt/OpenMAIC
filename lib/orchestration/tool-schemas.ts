/**
 * 无状态生成的动作模式
 *
 * 用于在结构化输出提示词中包含的动作文本描述。
 * 动作从模型响应中的 JSON 数组项解析。
 */

import { SLIDE_ONLY_ACTIONS } from '@/lib/types/action';

// ==================== 有效动作 ====================

/**
 * 按场景类型过滤允许的动作。
 * 仅幻灯片动作（spotlight、laser）在非幻灯片场景中被移除。
 */
export function getEffectiveActions(allowedActions: string[], sceneType?: string): string[] {
  if (!sceneType || sceneType === 'slide') return allowedActions;
  return allowedActions.filter(
    (a) => !SLIDE_ONLY_ACTIONS.includes(a as (typeof SLIDE_ONLY_ACTIONS)[number]),
  );
}

// ==================== 文本描述 ====================

/**
 * 获取允许动作的文本描述，用于包含在系统提示词中。
 * 当模型使用 JSON 数组格式生成结构化输出时使用。
 */
export function getActionDescriptions(allowedActions: string[]): string {
  const descriptions: Record<string, string> = {
    spotlight:
      'Focus attention on a single key element by dimming everything else. Use sparingly — max 1-2 per response. Parameters: { elementId: string, dimOpacity?: number }',
    // 中文：通过调暗其他所有内容来聚焦于单个关键元素。谨慎使用 — 每次响应最多 1-2 次。参数：{ elementId: string, dimOpacity?: number }
    laser:
      'Point at an element with a laser pointer effect. Parameters: { elementId: string, color?: string }',
    // 中文：用激光笔效果指向元素。参数：{ elementId: string, color?: string }
    wb_open:
      'Open the whiteboard for hand-drawn explanations, formulas, diagrams, or step-by-step derivations. Creates a new whiteboard if none exists. Call this before adding elements. Parameters: {}',
    // 中文：打开白板用于手绘解释、公式、图表或逐步推导。如果不存在则创建新白板。在添加元素之前调用此动作。参数：{}
    wb_draw_text:
      'Add text to the whiteboard. Use for writing formulas, steps, or key points. Parameters: { content: string, x: number, y: number, width?: number, height?: number, fontSize?: number, color?: string, elementId?: string }',
    // 中文：向白板添加文本。用于书写公式、步骤或要点。参数：{ content: string, x: number, y: number, width?: number, height?: number, fontSize?: number, color?: string, elementId?: string }
    wb_draw_shape:
      'Add a shape to the whiteboard. Use for diagrams and visual explanations. Parameters: { shape: "rectangle"|"circle"|"triangle", x: number, y: number, width: number, height: number, fillColor?: string, elementId?: string }',
    // 中文：向白板添加形状。用于图表和视觉解释。参数：{ shape: "rectangle"|"circle"|"triangle", x: number, y: number, width: number, height: number, fillColor?: string, elementId?: string }
    wb_draw_chart:
      'Add a chart to the whiteboard. Use for data visualization (bar charts, line graphs, pie charts, etc.). Parameters: { chartType: "bar"|"column"|"line"|"pie"|"ring"|"area"|"radar"|"scatter", x: number, y: number, width: number, height: number, data: { labels: string[], legends: string[], series: number[][] }, themeColors?: string[], elementId?: string }',
    // 中文：向白板添加图表。用于数据可视化（柱状图、折线图、饼图等）。参数：{ chartType: "bar"|"column"|"line"|"pie"|"ring"|"area"|"radar"|"scatter", x: number, y: number, width: number, height: number, data: { labels: string[], legends: string[], series: number[][] }, themeColors?: string[], elementId?: string }
    wb_draw_latex:
      'Add a LaTeX formula to the whiteboard. Use for mathematical equations and scientific notation. Parameters: { latex: string, x: number, y: number, width?: number, height?: number, color?: string, elementId?: string }',
    // 中文：向白板添加 LaTeX 公式。用于数学方程和科学记数法。参数：{ latex: string, x: number, y: number, width?: number, height?: number, color?: string, elementId?: string }
    wb_draw_table:
      'Add a table to the whiteboard. Use for structured data display and comparisons. Parameters: { x: number, y: number, width: number, height: number, data: string[][] (first row is header), outline?: { width: number, style: string, color: string }, theme?: { color: string }, elementId?: string }',
    // 中文：向白板添加表格。用于结构化数据显示和比较。参数：{ x: number, y: number, width: number, height: number, data: string[][] (第一行是表头), outline?: { width: number, style: string, color: string }, theme?: { color: string }, elementId?: string }
    wb_draw_line:
      'Add a line or arrow to the whiteboard. Use for connecting elements, drawing relationships, flow diagrams, or annotations. Parameters: { startX: number, startY: number, endX: number, endY: number, color?: string (default "#333333"), width?: number (line thickness, default 2), style?: "solid"|"dashed" (default "solid"), points?: [startMarker, endMarker] where marker is ""|"arrow" (default ["",""]), elementId?: string }',
    // 中文：向白板添加线条或箭头。用于连接元素、绘制关系、流程图或注释。参数：{ startX: number, startY: number, endX: number, endY: number, color?: string (默认 "#333333"), width?: number (线条粗细, 默认 2), style?: "solid"|"dashed" (默认 "solid"), points?: [起始标记, 结束标记] 其中标记为 ""|"arrow" (默认 ["",""]), elementId?: string }
    wb_clear:
      'Clear all elements from the whiteboard. Use when whiteboard is too crowded before adding new elements. Parameters: {}',
    // 中文：清除白板上的所有元素。当白板太拥挤时在添加新元素之前使用。参数：{}
    wb_delete:
      'Delete a specific element from the whiteboard by its ID. Use to remove an outdated, incorrect, or overlapping element without clearing the entire board. Parameters: { elementId: string }',
    // 中文：通过 ID 删除白板上的特定元素。用于删除过时、错误或重叠的元素而无需清除整个白板。参数：{ elementId: string }
    wb_close:
      'Close the whiteboard and return to the slide view. Always close after you finish drawing. Parameters: {}',
    // 中文：关闭白板并返回幻灯片视图。完成绘制后始终关闭。参数：{}
    play_video:
      'Start playback of a video element on the current slide. Synchronous — blocks until the video finishes playing. Use a speech action before this to introduce the video. Parameters: { elementId: string }',
    // 中文：开始播放当前幻灯片上的视频元素。同步 — 阻塞直到视频播放完成。在此之前使用语音动作来介绍视频。参数：{ elementId: string }
  };

  if (allowedActions.length === 0) {
    return 'You have no actions available. You can only speak to students.'; // 中文：你没有可用的动作。你只能与学生交谈。
  }

  const lines = allowedActions
    .filter((action) => descriptions[action])
    .map((action) => `- ${action}: ${descriptions[action]}`);

  return lines.join('\n');
}
