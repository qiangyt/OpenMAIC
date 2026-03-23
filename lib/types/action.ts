/**
 * 统一动作系统
 *
 * 动作是智能体与演示文稿交互的唯一机制。
 * 分为两类：
 * - 即发即弃：幻灯片上的视觉效果（聚光灯、激光笔）
 * - 同步：必须等待完成才能执行下一个动作（语音、白板、讨论）
 *
 * 在线（流式）和离线（回放）路径都使用相同的 Action 类型。
 */

// ==================== 基础 ====================

export interface ActionBase {
  id: string;
  title?: string;
  description?: string;
}

// ==================== 即发即弃动作 ====================

/** 聚光灯 — 聚焦于单个元素，将其他元素变暗 */
export interface SpotlightAction extends ActionBase {
  type: 'spotlight';
  elementId: string;
  dimOpacity?: number; // 默认 0.5
}

/** 激光笔 — 用激光效果指向元素 */
export interface LaserAction extends ActionBase {
  type: 'laser';
  elementId: string;
  color?: string; // 默认 '#ff0000'
}

// ==================== 同步动作 ====================

/** 语音 — 教师旁白（等待 TTS 完成） */
export interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
  audioId?: string;
  audioUrl?: string; // 服务端生成的 TTS 音频 URL
  voice?: string;
  speed?: number; // 默认 1.0
}

/** 打开白板（等待动画完成） */
export interface WbOpenAction extends ActionBase {
  type: 'wb_open';
}

/** 在白板上绘制文本（等待渲染完成） */
export interface WbDrawTextAction extends ActionBase {
  type: 'wb_draw_text';
  elementId?: string; // 自定义元素 ID，供后续引用（如 wb_delete）
  content: string; // HTML 字符串或纯文本
  x: number;
  y: number;
  width?: number; // 默认 400
  height?: number; // 默认 100
  fontSize?: number; // 默认 18
  color?: string; // 默认 '#333333'
}

/** 在白板上绘制形状（等待渲染完成） */
export interface WbDrawShapeAction extends ActionBase {
  type: 'wb_draw_shape';
  elementId?: string; // Custom element ID for later reference (e.g. wb_delete)
  shape: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string; // 默认 '#5b9bd5'
}

/** 在白板上绘制图表（等待渲染完成） */
export interface WbDrawChartAction extends ActionBase {
  type: 'wb_draw_chart';
  elementId?: string; // Custom element ID for later reference (e.g. wb_delete)
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter';
  x: number;
  y: number;
  width: number;
  height: number;
  data: {
    labels: string[];
    legends: string[];
    series: number[][];
  };
  themeColors?: string[];
}

/** 在白板上绘制 LaTeX 公式（等待渲染完成） */
export interface WbDrawLatexAction extends ActionBase {
  type: 'wb_draw_latex';
  elementId?: string; // Custom element ID for later reference (e.g. wb_delete)
  latex: string;
  x: number;
  y: number;
  width?: number; // default 400
  height?: number; // 根据公式宽高比自动计算
  color?: string; // 默认 '#000000'
}

/** 在白板上绘制表格（等待渲染完成） */
export interface WbDrawTableAction extends ActionBase {
  type: 'wb_draw_table';
  elementId?: string; // Custom element ID for later reference (e.g. wb_delete)
  x: number;
  y: number;
  width: number;
  height: number;
  data: string[][]; // 简化的二维字符串数组，第一行为表头
  outline?: { width: number; style: string; color: string };
  theme?: { color: string };
}

/** 在白板上绘制线条/箭头（等待渲染完成） */
export interface WbDrawLineAction extends ActionBase {
  type: 'wb_draw_line';
  elementId?: string; // Custom element ID for later reference (e.g. wb_delete)
  startX: number; // 起点 X 坐标（0-1000）
  startY: number; // 起点 Y 坐标（0-562）
  endX: number; // 终点 X 坐标（0-1000）
  endY: number; // 终点 Y 坐标（0-562）
  color?: string; // 默认 '#333333'
  width?: number; // 线条宽度，默认 2
  style?: 'solid' | 'dashed'; // 默认 'solid'
  points?: ['', 'arrow'] | ['arrow', ''] | ['arrow', 'arrow'] | ['', '']; // 端点标记，默认 ['', '']
}

/** 清除所有白板元素 */
export interface WbClearAction extends ActionBase {
  type: 'wb_clear';
}

/** 根据 ID 删除指定的白板元素 */
export interface WbDeleteAction extends ActionBase {
  type: 'wb_delete';
  elementId: string;
}

/** 关闭白板（等待动画完成） */
export interface WbCloseAction extends ActionBase {
  type: 'wb_close';
}

/** 播放视频 — 开始播放幻灯片上的视频元素 */
export interface PlayVideoAction extends ActionBase {
  type: 'play_video';
  elementId: string;
}

/** 讨论 — 触发圆桌讨论 */
export interface DiscussionAction extends ActionBase {
  type: 'discussion';
  topic: string;
  prompt?: string;
  agentId?: string;
}

// ==================== 联合类型 ====================

export type Action =
  | SpotlightAction
  | LaserAction
  | PlayVideoAction
  | SpeechAction
  | WbOpenAction
  | WbDrawTextAction
  | WbDrawShapeAction
  | WbDrawChartAction
  | WbDrawLatexAction
  | WbDrawTableAction
  | WbDrawLineAction
  | WbClearAction
  | WbDeleteAction
  | WbCloseAction
  | DiscussionAction;

export type ActionType = Action['type'];

/** 立即执行且不阻塞的动作类型 */
export const FIRE_AND_FORGET_ACTIONS: ActionType[] = ['spotlight', 'laser'];

/** 仅在幻灯片场景中有效的动作类型（需要幻灯片画布元素） */
export const SLIDE_ONLY_ACTIONS: ActionType[] = ['spotlight', 'laser'];

/** 必须在下一个动作执行前完成的动作类型 */
export const SYNC_ACTIONS: ActionType[] = [
  'speech',
  'play_video',
  'wb_open',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_clear',
  'wb_delete',
  'wb_close',
  'discussion',
];

// ==================== 画布工具类型（非动作） ====================

/**
 * 基于百分比的几何信息（0-100 坐标系统）
 * 用于聚光灯/激光笔覆盖层的响应式定位。
 */
export interface PercentageGeometry {
  x: number; // 0-100
  y: number; // 0-100
  w: number; // 0-100
  h: number; // 0-100
  centerX: number; // 0-100
  centerY: number; // 0-100
}
