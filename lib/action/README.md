# 动作执行引擎模块 (lib/action/)

> 统一的智能体动作执行层，替代原来的 28 个 Vercel AI SDK 工具

## 概览

本模块实现了 OpenMAIC 的动作执行逻辑，支持两种执行模式：

1. **即发即忘 (Fire-and-forget)**: `spotlight`, `laser` - 立即返回，不阻塞
2. **同步 (Synchronous)**: `speech`, `whiteboard`, `discussion` - 等待完成后再继续

```
┌─────────────────────────────────────────────────────────────────┐
│                      ActionEngine                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Action ──→ execute() ──→ dispatch by type                      │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ↓               ↓               ↓                  │
│         spotlight      speech/text     whiteboard               │
│              │               │               │                  │
│         [immediate]    [await TTS]    [await anim]              │
│              │               │               │                  │
│              └───────────────┴───────────────┘                  │
│                              │                                  │
│                              ↓                                  │
│                         processNext                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `engine.ts` | `ActionEngine` 类 - 动作执行引擎 |
| (类型定义在 `lib/types/action.ts`) | 所有动作类型的 TypeScript 定义 |

## ActionEngine 类

### 构造函数

```typescript
class ActionEngine {
  constructor(
    stageStore: StageStore,           // 舞台状态存储
    audioPlayer?: AudioPlayer         // 音频播放器（可选）
  ) { ... }
}
```

### 核心 API

```typescript
// 执行单个动作
async execute(action: Action): Promise<void>;

// 清除所有视觉效果
clearEffects(): void;

// 清理定时器
dispose(): void;
```

### 执行流程

```typescript
async execute(action: Action): Promise<void> {
  // 1. 自动打开白板（如果需要）
  if (action.type.startsWith('wb_') && action.type !== 'wb_open' && action.type !== 'wb_close') {
    await this.ensureWhiteboardOpen();
  }

  // 2. 根据动作类型分发
  switch (action.type) {
    case 'spotlight':       // 即发即忘
    case 'laser':           // 即发即忘
      this.executeXxx(action);
      return;               // 立即返回，不 await

    case 'play_video':      // 同步
    case 'speech':          // 同步
    case 'wb_*':            // 同步
      return this.executeXxx(action);  // await 完成
  }
}
```

## 动作类型

### 即发即忘动作

#### spotlight - 聚光灯效果

```typescript
interface SpotlightAction {
  type: 'spotlight';
  id: string;
  elementId: string;      // 要高亮的元素 ID
  dimOpacity?: number;    // 背景变暗程度 (0-1, 默认 0.5)
}
```

**效果**：高亮指定元素，其他元素变暗

**实现**：
```typescript
private executeSpotlight(action: SpotlightAction): void {
  useCanvasStore.getState().setSpotlight(action.elementId, {
    dimness: action.dimOpacity ?? 0.5,
  });
  this.scheduleEffectClear();  // 5 秒后自动清除
}
```

#### laser - 激光笔效果

```typescript
interface LaserAction {
  type: 'laser';
  id: string;
  elementId: string;     // 要指向的元素 ID
  color?: string;        // 激光颜色 (默认 '#ff0000')
}
```

**效果**：在指定元素上显示激光笔动画

**实现**：
```typescript
private executeLaser(action: LaserAction): void {
  useCanvasStore.getState().setLaser(action.elementId, {
    color: action.color ?? '#ff0000',
  });
  this.scheduleEffectClear();  // 5 秒后自动清除
}
```

### 同步动作

#### speech - 语音讲解

```typescript
interface SpeechAction {
  type: 'speech';
  id: string;
  text: string;          // 要朗读的文本
  audioId?: string;      // 预生成音频 ID
  audioUrl?: string;     // 预生成音频 URL
  voice?: string;        // 语音 ID
  speed?: number;        // 语速 (默认 1.0)
}
```

**执行**：
1. 尝试播放预生成的 TTS 音频
2. 如果没有音频，由 PlaybackEngine 处理（阅读计时器或浏览器 TTS）

```typescript
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
```

#### play_video - 播放视频

```typescript
interface PlayVideoAction {
  type: 'play_video';
  id: string;
  elementId: string;     // 视频元素 ID
}
```

**执行**：
1. 等待视频媒体生成完成（如果是 AI 生成的）
2. 触发视频播放
3. 等待播放结束

```typescript
private async executePlayVideo(action: PlayVideoAction): Promise<void> {
  // 1. 解析媒体占位符 ID
  const placeholderId = this.resolveMediaPlaceholderId(action.elementId);

  // 2. 如果是 AI 生成的视频，等待生成完成
  if (placeholderId) {
    await this.waitForMediaReady(placeholderId);
  }

  // 3. 触发播放
  useCanvasStore.getState().playVideo(action.elementId);

  // 4. 等待播放结束
  return new Promise<void>((resolve) => {
    const unsubscribe = useCanvasStore.subscribe((state) => {
      if (state.playingVideoElementId !== action.elementId) {
        unsubscribe();
        resolve();
      }
    });
  });
}
```

#### wb_open - 打开白板

```typescript
interface WbOpenAction {
  type: 'wb_open';
  id: string;
}
```

**执行**：
1. 确保白板场景存在
2. 设置白板为打开状态
3. 等待打开动画完成 (2 秒)

```typescript
private async executeWbOpen(): Promise<void> {
  this.stageAPI.whiteboard.get();  // 确保白板存在
  useCanvasStore.getState().setWhiteboardOpen(true);
  await delay(2000);  // 等待动画
}
```

#### wb_draw_text - 绘制文本

```typescript
interface WbDrawTextAction {
  type: 'wb_draw_text';
  id: string;
  elementId?: string;     // 可选的自定义元素 ID
  content: string;        // 文本内容（支持 HTML）
  x: number;              // X 坐标
  y: number;              // Y 坐标
  width?: number;         // 宽度 (默认 400)
  height?: number;        // 高度 (默认 100)
  fontSize?: number;      // 字体大小 (默认 18)
  color?: string;         // 文本颜色 (默认 '#333333')
}
```

**执行**：
1. 获取白板场景
2. 添加文本元素
3. 等待淡入动画 (800ms)

```typescript
private async executeWbDrawText(action: WbDrawTextAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  // 包装为 HTML
  let htmlContent = action.content;
  if (!htmlContent.startsWith('<')) {
    htmlContent = `<p style="font-size: ${fontSize}px;">${htmlContent}</p>`;
  }

  this.stageAPI.whiteboard.addElement({
    id: action.elementId || '',
    type: 'text',
    content: htmlContent,
    left: action.x,
    top: action.y,
    width: action.width ?? 400,
    height: action.height ?? 100,
    defaultColor: action.color ?? '#333333',
  }, wb.data.id);

  await delay(800);
}
```

#### wb_draw_shape - 绘制形状

```typescript
interface WbDrawShapeAction {
  type: 'wb_draw_shape';
  id: string;
  elementId?: string;
  shape: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;     // 填充颜色 (默认 '#5b9bd5')
}
```

**SVG 路径**：
```typescript
const SHAPE_PATHS: Record<string, string> = {
  rectangle: 'M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z',
  circle: 'M 500 0 A 500 500 0 1 1 499 0 Z',
  triangle: 'M 500 0 L 1000 1000 L 0 1000 Z',
};
```

#### wb_draw_chart - 绘制图表

```typescript
interface WbDrawChartAction {
  type: 'wb_draw_chart';
  id: string;
  elementId?: string;
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter';
  x: number;
  y: number;
  width: number;
  height: number;
  data: {
    labels: string[];     // X 轴标签
    legends: string[];    // 图例
    series: number[][];   // 数据系列
  };
  themeColors?: string[]; // 主题颜色
}
```

#### wb_draw_latex - 绘制 LaTeX 公式

```typescript
interface WbDrawLatexAction {
  type: 'wb_draw_latex';
  id: string;
  elementId?: string;
  latex: string;          // LaTeX 代码
  x: number;
  y: number;
  width?: number;         // 宽度 (默认 400)
  height?: number;        // 高度 (默认 80)
  color?: string;         // 颜色 (默认 '#000000')
}
```

**实现**：使用 KaTeX 渲染 LaTeX 为 HTML

```typescript
private async executeWbDrawLatex(action: WbDrawLatexAction): Promise<void> {
  try {
    const html = katex.renderToString(action.latex, {
      throwOnError: false,
      displayMode: true,
      output: 'html',
    });

    this.stageAPI.whiteboard.addElement({
      type: 'latex',
      latex: action.latex,
      html,
      color: action.color ?? '#000000',
    }, wb.data.id);
  } catch (err) {
    log.warn(`Failed to render latex "${action.latex}":`, err);
  }
}
```

#### wb_draw_table - 绘制表格

```typescript
interface WbDrawTableAction {
  type: 'wb_draw_table';
  id: string;
  elementId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string[][];       // 2D 字符串数组，第一行为表头
  outline?: { width: number; style: string; color: string };
  theme?: { color: string };
}
```

#### wb_draw_line - 绘制线条/箭头

```typescript
interface WbDrawLineAction {
  type: 'wb_draw_line';
  id: string;
  elementId?: string;
  startX: number;         // 起点 X
  startY: number;         // 起点 Y
  endX: number;           // 终点 X
  endY: number;           // 终点 Y
  color?: string;         // 颜色 (默认 '#333333')
  width?: number;         // 线宽 (默认 2)
  style?: 'solid' | 'dashed';  // 样式 (默认 'solid')
  points?: ['', ''] | ['arrow', ''] | ['', 'arrow'] | ['arrow', 'arrow'];  // 端点标记
}
```

#### wb_clear - 清空白板

```typescript
interface WbClearAction {
  type: 'wb_clear';
  id: string;
}
```

**执行**：
1. 保存快照（用于撤销）
2. 触发级联退出动画
3. 等待动画完成后删除元素

```typescript
private async executeWbClear(): Promise<void> {
  const elementCount = wb.data.elements?.length || 0;
  if (elementCount === 0) return;

  // 保存快照
  useWhiteboardHistoryStore.getState().pushSnapshot(
    wb.data.elements!,
    getClientTranslation('whiteboard.beforeAIClear')
  );

  // 触发级联动画
  useCanvasStore.getState().setWhiteboardClearing(true);

  // 等待动画：基础 380ms + 每元素 55ms，最大 1400ms
  const animMs = Math.min(380 + elementCount * 55, 1400);
  await delay(animMs);

  // 实际删除
  this.stageAPI.whiteboard.update({ elements: [] }, wb.data.id);
  useCanvasStore.getState().setWhiteboardClearing(false);
}
```

#### wb_delete - 删除指定元素

```typescript
interface WbDeleteAction {
  type: 'wb_delete';
  id: string;
  elementId: string;      // 要删除的元素 ID
}
```

#### wb_close - 关闭白板

```typescript
interface WbCloseAction {
  type: 'wb_close';
  id: string;
}
```

**执行**：等待关闭动画 (700ms)

#### discussion - 触发讨论

```typescript
interface DiscussionAction {
  type: 'discussion';
  id: string;
  topic: string;          // 讨论主题
  prompt?: string;        // 讨论引导语
  agentId?: string;       // 触发的智能体 ID
}
```

**注意**：Discussion 的生命周期由 PlaybackEngine 管理，ActionEngine 不执行任何操作。

## 自动打开白板

当执行任何 `wb_draw_*`、`wb_clear`、`wb_delete` 动作时，如果白板未打开，引擎会自动打开：

```typescript
async execute(action: Action): Promise<void> {
  if (action.type.startsWith('wb_') && action.type !== 'wb_open' && action.type !== 'wb_close') {
    await this.ensureWhiteboardOpen();
  }
  // ...
}

private async ensureWhiteboardOpen(): Promise<void> {
  if (!useCanvasStore.getState().whiteboardOpen) {
    await this.executeWbOpen();
  }
}
```

## 视觉效果自动清除

即发即忘动作（spotlight, laser）会在 5 秒后自动清除：

```typescript
const EFFECT_AUTO_CLEAR_MS = 5000;

private scheduleEffectClear(): void {
  if (this.effectTimer) {
    clearTimeout(this.effectTimer);
  }
  this.effectTimer = setTimeout(() => {
    useCanvasStore.getState().clearAllEffects();
    this.effectTimer = null;
  }, EFFECT_AUTO_CLEAR_MS);
}
```

## 媒体解析

对于 AI 生成的视频/图片，引擎会解析占位符 ID 并等待生成完成：

```typescript
private resolveMediaPlaceholderId(elementId: string): string | null {
  const { scenes, currentSceneId } = this.stageStore.getState();

  // 优先搜索当前场景
  for (const scene of orderedScenes) {
    if (scene?.type !== 'slide') continue;

    const elements = scene.content?.canvas?.elements;
    const el = elements?.find((e) => e.id === elementId);

    if (el?.src && isMediaPlaceholder(el.src)) {
      return el.src;  // 如 'gen_vid_abc123'
    }
  }
  return null;
}
```

## 动画延迟常量

| 动作 | 延迟 | 原因 |
|------|------|------|
| `wb_open` | 2000ms | 慢速弹簧动画 (stiffness 120, damping 18, mass 1.2) |
| `wb_close` | 700ms | 500ms ease-out tween + 缓冲 |
| `wb_draw_*` | 800ms | 元素淡入动画 |
| `wb_delete` | 300ms | 元素淡出动画 |
| `wb_clear` | 380-1400ms | 级联退出动画 (380ms + 55ms × 元素数) |

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                      lib/action/                                │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/types/action.ts (Action 类型定义)                        │
│  - lib/api/stage-api.ts (StageAPI, StageStore)                 │
│  - lib/store/canvas.ts (useCanvasStore)                        │
│  - lib/store/whiteboard-history.ts (useWhiteboardHistoryStore) │
│  - lib/store/media-generation.ts (useMediaGenerationStore)     │
│  - lib/utils/audio-player.ts (AudioPlayer)                     │
│  - lib/i18n (getClientTranslation)                             │
│  - katex (LaTeX 渲染)                                          │
│                                                                 │
│  被依赖:                                                        │
│  - lib/playback/engine.ts (PlaybackEngine)                     │
│  - components/stage.tsx (实时流)                               │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么统一在线和离线执行？

1. **代码复用**：相同的动作执行逻辑，无论是实时流还是回放
2. **一致性**：用户体验完全一致
3. **可测试性**：可以独立测试动作执行逻辑

### 为什么区分即发即忘和同步？

1. **用户体验**：spotlight/laser 不应该阻塞语音
2. **性能**：视觉效果可以并行触发
3. **简单性**：即发即忘动作不需要 Promise 链

### 为什么白板操作需要延迟？

1. **动画同步**：等待视觉动画完成，避免下一个动作过早执行
2. **用户体验**：给用户时间看到绘制过程
3. **录音对齐**：如果正在录制，确保动作和语音对齐

### 为什么 spotlight/laser 自动清除？

1. **避免视觉污染**：效果不应该永久保留
2. **用户体验**：5 秒足够让用户注意到重点
3. **一致性**：与实际教师的激光笔行为一致
