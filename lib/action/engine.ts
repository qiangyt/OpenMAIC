/**
 * ActionEngine — 智能体动作的统一执行层
 *
 * 用单一引擎替代 ai-tools.ts 中的 28 个 Vercel AI SDK 工具，
 * 在线（流式）和离线（回放）两种路径共享此引擎。
 *
 * 两种执行模式：
 * - 即发即忘：spotlight、laser — 立即分发并返回
 * - 同步：speech、whiteboard、discussion — 等待完成
 */

import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { useCanvasStore } from '@/lib/store/canvas';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { useMediaGenerationStore, isMediaPlaceholder } from '@/lib/store/media-generation';
import { getClientTranslation } from '@/lib/i18n';
import type { AudioPlayer } from '@/lib/utils/audio-player';
import type {
  Action,
  SpotlightAction,
  LaserAction,
  SpeechAction,
  PlayVideoAction,
  WbDrawTextAction,
  WbDrawShapeAction,
  WbDrawChartAction,
  WbDrawLatexAction,
  WbDrawTableAction,
  WbDeleteAction,
  WbDrawLineAction,
} from '@/lib/types/action';
import katex from 'katex';
import { createLogger } from '@/lib/logger';

const log = createLogger('ActionEngine');

// ==================== SVG 形状路径 ====================

const SHAPE_PATHS: Record<string, string> = {
  rectangle: 'M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z',
  circle: 'M 500 0 A 500 500 0 1 1 499 0 Z',
  triangle: 'M 500 0 L 1000 1000 L 0 1000 Z',
};

// ==================== 辅助函数 ====================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== ActionEngine 类 ====================

/** 即发即忘效果的默认自动清除时长（毫秒）*/
const EFFECT_AUTO_CLEAR_MS = 5000;

export class ActionEngine {
  private stageStore: StageStore;
  private stageAPI: ReturnType<typeof createStageAPI>;
  private audioPlayer: AudioPlayer | null;
  private effectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(stageStore: StageStore, audioPlayer?: AudioPlayer) {
    this.stageStore = stageStore;
    this.stageAPI = createStageAPI(stageStore);
    this.audioPlayer = audioPlayer ?? null;
  }

  /** 当引擎不再需要时清理计时器 */
  dispose(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
  }

  /**
   * 执行单个动作。
   * 即发即忘动作立即返回。
   * 同步动作返回一个 Promise，在动作完成时 resolve。
   */
  async execute(action: Action): Promise<void> {
    // 如果在白板关闭时尝试执行绘制/清除/删除动作，自动打开白板
    if (action.type.startsWith('wb_') && action.type !== 'wb_open' && action.type !== 'wb_close') {
      await this.ensureWhiteboardOpen();
    }

    switch (action.type) {
      // 即发即忘
      case 'spotlight':
        this.executeSpotlight(action);
        return;
      case 'laser':
        this.executeLaser(action);
        return;
      // 同步 — 视频
      case 'play_video':
        return this.executePlayVideo(action as PlayVideoAction);

      // 同步
      case 'speech':
        return this.executeSpeech(action);
      case 'wb_open':
        return this.executeWbOpen();
      case 'wb_draw_text':
        return this.executeWbDrawText(action);
      case 'wb_draw_shape':
        return this.executeWbDrawShape(action);
      case 'wb_draw_chart':
        return this.executeWbDrawChart(action);
      case 'wb_draw_latex':
        return this.executeWbDrawLatex(action);
      case 'wb_draw_table':
        return this.executeWbDrawTable(action);
      case 'wb_draw_line':
        return this.executeWbDrawLine(action as WbDrawLineAction);
      case 'wb_clear':
        return this.executeWbClear();
      case 'wb_delete':
        return this.executeWbDelete(action as WbDeleteAction);
      case 'wb_close':
        return this.executeWbClose();
      case 'discussion':
        // 讨论生命周期通过引擎回调在外部管理
        return;
    }
  }

  /** 清除所有活动的视觉效果 */
  clearEffects(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
    useCanvasStore.getState().clearAllEffects();
  }

  /** 为即发即忘效果安排自动清除 */
  private scheduleEffectClear(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
    }
    this.effectTimer = setTimeout(() => {
      useCanvasStore.getState().clearAllEffects();
      this.effectTimer = null;
    }, EFFECT_AUTO_CLEAR_MS);
  }

  // ==================== 即发即忘 ====================

  private executeSpotlight(action: SpotlightAction): void {
    useCanvasStore.getState().setSpotlight(action.elementId, {
      dimness: action.dimOpacity ?? 0.5,
    });
    this.scheduleEffectClear();
  }

  private executeLaser(action: LaserAction): void {
    useCanvasStore.getState().setLaser(action.elementId, {
      color: action.color ?? '#ff0000',
    });
    this.scheduleEffectClear();
  }

  // ==================== 同步 — 语音 ====================

  private async executeSpeech(action: SpeechAction): Promise<void> {
    if (!this.audioPlayer) return;

    return new Promise<void>((resolve) => {
      this.audioPlayer!.onEnded(() => resolve());
      this.audioPlayer!.play(action.audioId || '', action.audioUrl)
        .then((audioStarted) => {
          if (!audioStarted) resolve();
        })
        .catch(() => resolve());
    });
  }

  // ==================== 同步 — 视频 ====================

  private async executePlayVideo(action: PlayVideoAction): Promise<void> {
    // 将视频元素的 src 解析为媒体占位符 ID（如 gen_vid_1）。
    // action.elementId 是幻灯片元素 ID（如 video_abc123），但媒体
    // 存储以占位符 ID 为键，因此需要桥接两者。
    const placeholderId = this.resolveMediaPlaceholderId(action.elementId);

    if (placeholderId) {
      const task = useMediaGenerationStore.getState().getTask(placeholderId);
      if (task && task.status !== 'done') {
        // 等待媒体就绪（或失败）
        await new Promise<void>((resolve) => {
          const unsubscribe = useMediaGenerationStore.subscribe((state) => {
            const t = state.tasks[placeholderId];
            if (!t || t.status === 'done' || t.status === 'failed') {
              unsubscribe();
              resolve();
            }
          });
          // 再次检查，以防在 getState 和 subscribe 之间状态已改变
          const current = useMediaGenerationStore.getState().tasks[placeholderId];
          if (!current || current.status === 'done' || current.status === 'failed') {
            unsubscribe();
            resolve();
          }
        });

        // 如果失败，跳过播放
        if (useMediaGenerationStore.getState().tasks[placeholderId]?.status === 'failed') {
          return;
        }
      }
    }

    useCanvasStore.getState().playVideo(action.elementId);

    // 等待视频播放完成
    return new Promise<void>((resolve) => {
      const unsubscribe = useCanvasStore.subscribe((state) => {
        if (state.playingVideoElementId !== action.elementId) {
          unsubscribe();
          resolve();
        }
      });
      if (useCanvasStore.getState().playingVideoElementId !== action.elementId) {
        unsubscribe();
        resolve();
      }
    });
  }

  // ==================== 辅助函数 — 媒体解析 ====================

  /**
   * 在当前舞台的场景中查找视频/图片元素的 src。
   * 如果 src 是媒体占位符 ID（gen_vid_*, gen_img_*），则返回该 ID，否则返回 null。
   */
  private resolveMediaPlaceholderId(elementId: string): string | null {
    const { scenes, currentSceneId } = this.stageStore.getState();

    // 为提高效率，优先搜索当前场景，然后搜索其余场景
    const orderedScenes = currentSceneId
      ? [
          scenes.find((s) => s.id === currentSceneId),
          ...scenes.filter((s) => s.id !== currentSceneId),
        ]
      : scenes;

    for (const scene of orderedScenes) {
      if (!scene || scene.type !== 'slide') continue;
      const elements = (
        scene.content as {
          canvas?: { elements?: Array<{ id: string; src?: string }> };
        }
      )?.canvas?.elements;
      if (!Array.isArray(elements)) continue;
      const el = elements.find((e: { id: string }) => e.id === elementId);
      if (el && 'src' in el && typeof el.src === 'string' && isMediaPlaceholder(el.src)) {
        return el.src;
      }
    }
    return null;
  }

  // ==================== 同步 — 白板 ====================

  /** 如果白板未打开，自动打开 */
  private async ensureWhiteboardOpen(): Promise<void> {
    if (!useCanvasStore.getState().whiteboardOpen) {
      await this.executeWbOpen();
    }
  }

  private async executeWbOpen(): Promise<void> {
    // 确保白板存在
    this.stageAPI.whiteboard.get();
    useCanvasStore.getState().setWhiteboardOpen(true);
    // 等待打开动画完成（慢速弹簧动画：刚度 120，阻尼 18，质量 1.2）
    await delay(2000);
  }

  private async executeWbDrawText(action: WbDrawTextAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    const fontSize = action.fontSize ?? 18;
    let htmlContent = action.content ?? '';
    if (!htmlContent) return; // nothing to draw
    if (!htmlContent.startsWith('<')) {
      htmlContent = `<p style="font-size: ${fontSize}px;">${htmlContent}</p>`;
    }

    this.stageAPI.whiteboard.addElement(
      {
        id: action.elementId || '',
        type: 'text',
        content: htmlContent,
        left: action.x,
        top: action.y,
        width: action.width ?? 400,
        height: action.height ?? 100,
        rotate: 0,
        defaultFontName: 'Microsoft YaHei',
        defaultColor: action.color ?? '#333333',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      wb.data.id,
    );

    // 等待元素淡入动画完成
    await delay(800);
  }

  private async executeWbDrawShape(action: WbDrawShapeAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    this.stageAPI.whiteboard.addElement(
      {
        id: action.elementId || '',
        type: 'shape',
        viewBox: [1000, 1000] as [number, number],
        path: SHAPE_PATHS[action.shape] ?? SHAPE_PATHS.rectangle,
        left: action.x,
        top: action.y,
        width: action.width,
        height: action.height,
        rotate: 0,
        fill: action.fillColor ?? '#5b9bd5',
        fixedRatio: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      wb.data.id,
    );

    // 等待元素淡入动画完成
    await delay(800);
  }

  private async executeWbDrawChart(action: WbDrawChartAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    this.stageAPI.whiteboard.addElement(
      {
        id: action.elementId || '',
        type: 'chart',
        left: action.x,
        top: action.y,
        width: action.width,
        height: action.height,
        rotate: 0,
        chartType: action.chartType,
        data: action.data,
        themeColors: action.themeColors ?? ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      wb.data.id,
    );

    await delay(800);
  }

  private async executeWbDrawLatex(action: WbDrawLatexAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    try {
      const html = katex.renderToString(action.latex, {
        throwOnError: false,
        displayMode: true,
        output: 'html',
      });

      this.stageAPI.whiteboard.addElement(
        {
          id: action.elementId || '',
          type: 'latex',
          left: action.x,
          top: action.y,
          width: action.width ?? 400,
          height: action.height ?? 80,
          rotate: 0,
          latex: action.latex,
          html,
          color: action.color ?? '#000000',
          fixedRatio: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        wb.data.id,
      );
    } catch (err) {
      log.warn(`Failed to render latex "${action.latex}":`, err);
      return;
    }

    await delay(800);
  }

  private async executeWbDrawTable(action: WbDrawTableAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    const rows = action.data.length;
    const cols = rows > 0 ? action.data[0].length : 0;
    if (rows === 0 || cols === 0) return;

    // 构建 colWidths：等宽分布
    const colWidths = Array(cols).fill(1 / cols);

    // 从 string[][] 构建 TableCell[][]
    let cellId = 0;
    const tableData = action.data.map((row) =>
      row.map((text) => ({
        id: `cell_${cellId++}`,
        colspan: 1,
        rowspan: 1,
        text,
      })),
    );

    this.stageAPI.whiteboard.addElement(
      {
        id: action.elementId || '',
        type: 'table',
        left: action.x,
        top: action.y,
        width: action.width,
        height: action.height,
        rotate: 0,
        colWidths,
        cellMinHeight: 36,
        data: tableData,
        outline: action.outline ?? {
          width: 2,
          style: 'solid',
          color: '#eeece1',
        },
        theme: action.theme
          ? {
              color: action.theme.color,
              rowHeader: true,
              rowFooter: false,
              colHeader: false,
              colFooter: false,
            }
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      wb.data.id,
    );

    await delay(800);
  }

  private async executeWbDrawLine(action: WbDrawLineAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    // 计算边界框 — left/top 是起点/终点坐标的最小值
    const left = Math.min(action.startX, action.endX);
    const top = Math.min(action.startY, action.endY);

    // 将绝对坐标转换为相对坐标（相对于 left/top）
    const start: [number, number] = [action.startX - left, action.startY - top];
    const end: [number, number] = [action.endX - left, action.endY - top];

    this.stageAPI.whiteboard.addElement(
      {
        id: action.elementId || '',
        type: 'line',
        left,
        top,
        width: action.width ?? 2,
        start,
        end,
        style: action.style ?? 'solid',
        color: action.color ?? '#333333',
        points: action.points ?? ['', ''],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      wb.data.id,
    );

    // 等待元素淡入动画完成
    await delay(800);
  }

  private async executeWbDelete(action: WbDeleteAction): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    this.stageAPI.whiteboard.deleteElement(action.elementId, wb.data.id);
    await delay(300);
  }

  private async executeWbClear(): Promise<void> {
    const wb = this.stageAPI.whiteboard.get();
    if (!wb.success || !wb.data) return;

    const elementCount = wb.data.elements?.length || 0;
    if (elementCount === 0) return;

    // 在 AI 清除前保存快照（与 index.tsx 中的 UI handleClear 对应）
    useWhiteboardHistoryStore
      .getState()
      .pushSnapshot(wb.data.elements!, getClientTranslation('whiteboard.beforeAIClear'));

    // 触发级联退出动画
    useCanvasStore.getState().setWhiteboardClearing(true);

    // 等待级联动画：基础 380ms + 每个元素 55ms，上限 1400ms
    const animMs = Math.min(380 + elementCount * 55, 1400);
    await delay(animMs);

    // 实际移除元素
    this.stageAPI.whiteboard.update({ elements: [] }, wb.data.id);
    useCanvasStore.getState().setWhiteboardClearing(false);
  }

  private async executeWbClose(): Promise<void> {
    useCanvasStore.getState().setWhiteboardOpen(false);
    // 等待关闭动画完成（500ms ease-out 补间动画）
    await delay(700);
  }
}
