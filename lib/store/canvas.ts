import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';
import type { TextAttrs } from '@/lib/prosemirror/utils';
import { defaultRichTextAttrs } from '@/lib/prosemirror/utils';
import type { TextFormatPainter, ShapeFormatPainter, CreatingElement } from '@/lib/types/edit';
import type { PercentageGeometry } from '@/lib/types/action';

/**
 * 聚光灯选项
 */
export interface SpotlightOptions {
  radius?: number; // 聚光灯半径（像素）
  dimness?: number; // 背景变暗级别（0-1）
  transition?: number; // 过渡动画持续时间（毫秒）
}

/**
 * 高亮覆盖层选项
 */
export interface HighlightOverlayOptions {
  color?: string; // 高亮颜色
  opacity?: number; // 高亮不透明度（0-1）
  borderWidth?: number; // 边框宽度
  animated?: boolean; // 是否动画
}

/**
 * 激光笔选项
 */
export interface LaserOptions {
  color?: string; // 激光笔颜色，默认红色
  duration?: number; // 持续时间（毫秒）
}

/**
 * 画布 Store - 管理画布编辑器的所有 UI 状态
 *
 * 职责：
 * - 元素选择状态（选中、操作、编辑）
 * - 画布视口状态（缩放、拖拽、标尺、网格）
 * - 工具栏和面板状态
 * - 正在创建的元素
 * - 富文本编辑状态
 * - 格式刷状态
 *
 * 注意：不管理幻灯片数据（元素、背景等），这些由场景上下文管理
 */

// ==================== Store 接口 ====================

interface CanvasState {
  // ===== 元素选择状态 =====
  activeElementIdList: string[]; // 当前选中的元素 ID
  handleElementId: string; // 正在操作的元素（拖拽、缩放等）
  activeGroupElementId: string; // 组内选中的子元素
  editingElementId: string; // 正在编辑的元素（如文本编辑）
  hiddenElementIdList: string[]; // 隐藏的元素 ID

  // ===== 教学功能状态 =====
  spotlightElementId: string; // 聚光灯聚焦的元素
  spotlightOptions: SpotlightOptions | null; // 聚光灯配置
  spotlightMode: 'pixel' | 'percentage'; // 聚光灯模式：像素或百分比
  spotlightPercentageGeometry: PercentageGeometry | null; // 百分比模式的几何信息
  highlightedElementIds: string[]; // 高亮的元素 ID
  highlightOptions: HighlightOverlayOptions | null; // 高亮配置
  laserElementId: string; // 激光笔指向的元素
  laserOptions: LaserOptions | null; // 激光笔配置
  zoomTarget: { elementId: string; scale: number } | null; // 缩放目标

  // ===== 画布视口状态 =====
  canvasScale: number; // 画布实际缩放比例
  canvasPercentage: number; // 画布百分比（用于计算 canvasScale）
  viewportSize: number; // 视口宽度基准（默认 1000px）
  viewportRatio: number; // 视口宽高比（默认 0.5625，即 16:9）
  canvasDragged: boolean; // 画布是否正在被拖拽

  // ===== 显示辅助 =====
  showRuler: boolean; // 显示标尺
  gridLineSize: number; // 网格线大小（0 表示隐藏）

  // ===== 工具栏和面板 =====
  toolbarState: 'design' | 'ai' | 'elAnimation'; // 右侧工具栏状态
  showSelectPanel: boolean; // 选择面板
  showSearchPanel: boolean; // 查找替换面板

  // ===== 元素创建 =====
  creatingElement: CreatingElement | null; // 正在创建的元素（需要绘制后插入）
  creatingCustomShape: boolean; // 绘制自定义形状（任意多边形）

  // ===== 编辑状态 =====
  isScaling: boolean; // 元素缩放进行中
  clipingImageElementId: string; // 正在裁剪的图片
  richTextAttrs: TextAttrs; // 富文本编辑状态

  // ===== 格式刷 =====
  textFormatPainter: TextFormatPainter | null; // 文本格式刷
  shapeFormatPainter: ShapeFormatPainter | null; // 形状格式刷

  // ===== 视频播放 =====
  playingVideoElementId: string; // 当前正在播放的视频元素

  // ===== 白板 =====
  whiteboardOpen: boolean; // 白板是否打开
  whiteboardClearing: boolean; // 白板清除动画进行中

  // ===== 其他 =====
  thumbnailsFocus: boolean; // 左侧缩略图区域是否聚焦
  editorAreaFocus: boolean; // 编辑区域是否聚焦
  disableHotkeys: boolean; // 是否禁用快捷键
  selectedTableCells: string[]; // 选中的表格单元格

  // ===== 操作 =====

  // ----- 元素选择 -----
  setActiveElementIdList: (ids: string[]) => void;
  setHandleElementId: (id: string) => void;
  setActiveGroupElementId: (id: string) => void;
  setEditingElementId: (id: string) => void;
  setHiddenElementIdList: (ids: string[]) => void;
  clearSelection: () => void; // 清除所有选择

  // ----- 画布视口 -----
  setCanvasScale: (scale: number) => void;
  setCanvasPercentage: (percentage: number) => void;
  setViewportSize: (size: number) => void;
  setViewportRatio: (ratio: number) => void;
  setCanvasDragged: (dragged: boolean) => void;

  // ----- 显示辅助 -----
  setRulerState: (show: boolean) => void;
  setGridLineSize: (size: number) => void;

  // ----- 工具栏和面板 -----
  setToolbarState: (state: 'design' | 'ai') => void;
  setSelectPanelState: (show: boolean) => void;
  setSearchPanelState: (show: boolean) => void;

  // ----- 元素创建 -----
  setCreatingElement: (element: CreatingElement | null) => void;
  setCreatingCustomShapeState: (creating: boolean) => void;

  // ----- 编辑状态 -----
  setScalingState: (isScaling: boolean) => void;
  setClipingImageElementId: (id: string) => void;
  setRichtextAttrs: (attrs: TextAttrs) => void;

  // ----- 格式刷 -----
  setTextFormatPainter: (painter: TextFormatPainter | null) => void;
  setShapeFormatPainter: (painter: ShapeFormatPainter | null) => void;

  // ----- 视频播放 -----
  playVideo: (elementId: string) => void;
  pauseVideo: () => void;

  // ----- 白板 -----
  setWhiteboardOpen: (open: boolean) => void;
  setWhiteboardClearing: (clearing: boolean) => void;

  // ----- 其他 -----
  setThumbnailsFocus: (focus: boolean) => void;
  setEditorAreaFocus: (focus: boolean) => void;
  setDisableHotkeysState: (disable: boolean) => void;
  setSelectedTableCells: (cells: string[]) => void;

  // ----- 教学功能 -----
  setSpotlight: (elementId: string, options?: SpotlightOptions) => void;
  clearSpotlight: () => void;
  setSpotlightPercentage: (
    elementId: string,
    geometry: PercentageGeometry,
    options?: SpotlightOptions,
  ) => void;
  setHighlight: (elementIds: string[], options?: HighlightOverlayOptions) => void;
  clearHighlight: () => void;
  setLaser: (elementId: string, options?: LaserOptions) => void;
  clearLaser: () => void;
  setZoom: (elementId: string, scale: number) => void;
  clearZoom: () => void;
  clearAllEffects: () => void;

  // ----- 批量操作 -----
  resetCanvasState: () => void; // 重置画布状态（用于切换场景时）
}

// ==================== 初始状态 ====================

const initialState = {
  // Element selection
  activeElementIdList: [],
  handleElementId: '',
  activeGroupElementId: '',
  editingElementId: '',
  hiddenElementIdList: [],

  // Canvas viewport
  canvasScale: 1,
  canvasPercentage: 90,
  viewportSize: 1000,
  viewportRatio: 0.5625, // 16:9
  canvasDragged: false,

  // Display aids
  showRuler: false,
  gridLineSize: 0,

  // Toolbar and panels
  toolbarState: 'ai' as const,
  showSelectPanel: false,
  showSearchPanel: false,

  // Element creation
  creatingElement: null,
  creatingCustomShape: false,

  // Editing state
  isScaling: false,
  clipingImageElementId: '',
  richTextAttrs: defaultRichTextAttrs,

  // Format painter
  textFormatPainter: null,
  shapeFormatPainter: null,

  // Video playback
  playingVideoElementId: '',

  // Whiteboard
  whiteboardOpen: false,
  whiteboardClearing: false,

  // Other: false,
  editorAreaFocus: false,
  thumbnailsFocus: false,
  disableHotkeys: false,
  selectedTableCells: [],

  // Teaching features
  spotlightElementId: '',
  spotlightOptions: null,
  spotlightMode: 'pixel' as const,
  spotlightPercentageGeometry: null,
  highlightedElementIds: [],
  highlightOptions: null,
  laserElementId: '',
  laserOptions: null,
  zoomTarget: null,
};

// ==================== Store 实现 ====================

const useCanvasStoreBase = create<CanvasState>((set, get) => ({
  ...initialState,

  // ===== 元素选择操作 =====

  setActiveElementIdList: (ids) => {
    set({ activeElementIdList: ids });
    // 自动设置 handleElementId：单选时设为该元素，多选或无选择时为空
    if (ids.length === 1) {
      set({ handleElementId: ids[0] });
    } else if (ids.length === 0) {
      set({ handleElementId: '' });
    }
    // 选中元素时自动切换到设计面板
    if (ids.length > 0) {
      set({ toolbarState: 'design' });
    }
  },

  setHandleElementId: (id) => set({ handleElementId: id }),

  setActiveGroupElementId: (id) => set({ activeGroupElementId: id }),

  setEditingElementId: (id) => set({ editingElementId: id }),

  setHiddenElementIdList: (ids) => set({ hiddenElementIdList: ids }),

  clearSelection: () => {
    set({
      activeElementIdList: [],
      handleElementId: '',
      activeGroupElementId: '',
      editingElementId: '',
    });
  },

  // ===== 画布视口操作 =====

  setCanvasScale: (scale) => set({ canvasScale: scale }),

  setCanvasPercentage: (percentage) => set({ canvasPercentage: percentage }),

  setViewportSize: (size) => set({ viewportSize: size }),

  setViewportRatio: (ratio) => set({ viewportRatio: ratio }),

  setCanvasDragged: (dragged) => set({ canvasDragged: dragged }),

  // ===== 显示辅助操作 =====

  setRulerState: (show) => set({ showRuler: show }),

  setGridLineSize: (size) => set({ gridLineSize: size }),

  // ===== 工具栏和面板操作 =====

  setToolbarState: (toolbarState) => set({ toolbarState }),

  setSelectPanelState: (show) => set({ showSelectPanel: show }),

  setSearchPanelState: (show) => set({ showSearchPanel: show }),

  // ===== 元素创建操作 =====

  setCreatingElement: (element) => set({ creatingElement: element }),

  setCreatingCustomShapeState: (creating) => set({ creatingCustomShape: creating }),

  // ===== 编辑状态操作 =====

  setScalingState: (isScaling) => set({ isScaling }),

  setClipingImageElementId: (id) => set({ clipingImageElementId: id }),

  setRichtextAttrs: (attrs) => set({ richTextAttrs: attrs }),

  // ===== 格式刷操作 =====

  setTextFormatPainter: (painter) => set({ textFormatPainter: painter }),

  setShapeFormatPainter: (painter) => set({ shapeFormatPainter: painter }),

  // ===== 视频播放操作 =====

  playVideo: (elementId) => set({ playingVideoElementId: elementId }),

  pauseVideo: () => set({ playingVideoElementId: '' }),

  // ===== 白板操作 =====

  setWhiteboardOpen: (open) => set({ whiteboardOpen: open }),
  setWhiteboardClearing: (clearing) => set({ whiteboardClearing: clearing }),

  // ===== 其他操作 =====

  setThumbnailsFocus: (focus) => set({ thumbnailsFocus: focus }),

  setEditorAreaFocus: (focus) => set({ editorAreaFocus: focus }),

  setDisableHotkeysState: (disable) => set({ disableHotkeys: disable }),

  setSelectedTableCells: (cells) => set({ selectedTableCells: cells }),

  // ===== 教学功能操作 =====

  setSpotlight: (elementId, options = {}) => {
    set({
      spotlightElementId: elementId,
      spotlightMode: 'pixel',
      spotlightOptions: {
        radius: 200,
        dimness: 0.7,
        transition: 300,
        ...options,
      },
      spotlightPercentageGeometry: null,
    });
  },

  setSpotlightPercentage: (elementId, geometry, options = {}) => {
    set({
      spotlightElementId: elementId,
      spotlightMode: 'percentage',
      spotlightPercentageGeometry: geometry,
      spotlightOptions: {
        dimness: 0.7,
        transition: 300,
        ...options,
      },
    });
  },

  clearSpotlight: () => {
    set({
      spotlightElementId: '',
      spotlightOptions: null,
      spotlightMode: 'pixel',
      spotlightPercentageGeometry: null,
    });
  },

  setHighlight: (elementIds, options = {}) => {
    set({
      highlightedElementIds: elementIds,
      highlightOptions: {
        color: '#ff6b6b',
        opacity: 0.3,
        borderWidth: 3,
        animated: true,
        ...options,
      },
    });
  },

  clearHighlight: () => {
    set({
      highlightedElementIds: [],
      highlightOptions: null,
    });
  },

  setLaser: (elementId, options = {}) => {
    set({
      laserElementId: elementId,
      laserOptions: {
        color: '#ff0000',
        duration: 3000,
        ...options,
      },
    });
  },

  clearLaser: () => {
    set({
      laserElementId: '',
      laserOptions: null,
    });
  },

  setZoom: (elementId, scale) => {
    set({
      zoomTarget: { elementId, scale },
    });
  },

  clearZoom: () => {
    set({
      zoomTarget: null,
    });
  },

  clearAllEffects: () => {
    set({
      spotlightElementId: '',
      spotlightOptions: null,
      spotlightMode: 'pixel',
      spotlightPercentageGeometry: null,
      highlightedElementIds: [],
      highlightOptions: null,
      laserElementId: '',
      laserOptions: null,
      zoomTarget: null,
      // 注意：playingVideoElementId 故意不在此时清除。
      // 视频播放有自己的生命周期（playVideo/pauseVideo/onEnded）
      // 不能被视觉效果自动清除计时器中断。
    });
  },

  // ===== 批量操作 =====

  resetCanvasState: () => {
    set({
      ...initialState,
      // 保留视口设置
      viewportSize: get().viewportSize,
      viewportRatio: get().viewportRatio,
    });
  },
}));

// 为 store 增加选择器，支持 store.use.xxx() 语法
export const useCanvasStore = createSelectors(useCanvasStoreBase);
