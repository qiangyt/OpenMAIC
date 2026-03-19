# Stage API 模块 (lib/api/)

> 为 AI 智能体提供完整的课程内容操作接口

## 概览

本模块实现了 Stage 操作的统一 API 层，供 AI 智能体和前端组件使用。

```
┌─────────────────────────────────────────────────────────────────┐
│                      createStageAPI()                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │   scene     │  │  element    │  │     canvas          │    │
│  │  场景管理    │  │  元素操作   │  │   画布/教学效果     │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │ navigation  │  │ whiteboard  │  │      mode           │    │
│  │  导航控制    │  │  白板操作   │  │   模式切换          │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `stage-api.ts` | API 入口，组合所有子 API |
| `stage-api-types.ts` | 类型定义 |
| `stage-api-scene.ts` | 场景管理 API |
| `stage-api-element.ts` | 元素操作 API |
| `stage-api-canvas.ts` | 画布/教学效果 API |
| `stage-api-navigation.ts` | 导航控制 API |
| `stage-api-whiteboard.ts` | 白板操作 API |
| `stage-api-mode.ts` | 模式切换 API |
| `stage-api-defaults.ts` | 默认值生成 |

## 设计原则

1. **类型安全**: 充分利用 TypeScript 类型系统
2. **易用性**: 提供高层抽象，API 命名清晰直观
3. **可扩展性**: 支持未来添加新场景类型
4. **幂等性**: 相同参数多次调用产生相同结果
5. **错误处理**: 返回明确的成功/失败状态和错误消息

## API 入口

```typescript
import { createStageAPI } from '@/lib/api';
import type { StageAPI } from '@/lib/api';

const api: StageAPI = createStageAPI(stageStore);

// API 结构
api = {
  scene: SceneAPI,
  navigation: NavigationAPI,
  element: ElementAPI,
  canvas: CanvasAPI,
  whiteboard: WhiteboardAPI,
  mode: ModeAPI,
  stage: StageMetaAPI,
};
```

## Scene API (场景管理)

```typescript
interface SceneAPI {
  // 创建场景
  create(params: CreateSceneParams): Promise<APIResult<{ sceneId: string }>>;

  // 获取场景
  get(sceneId: string): Scene | undefined;

  // 更新场景
  update(sceneId: string, updates: Partial<Scene>): APIResult;

  // 删除场景
  delete(sceneId: string): APIResult;

  // 列出所有场景
  list(): Scene[];

  // 复制场景
  duplicate(sceneId: string): Promise<APIResult<{ newSceneId: string }>>;
}

// 创建参数
interface CreateSceneParams {
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  order?: number;
  // 类型特定配置
  quizConfig?: QuizConfig;
  interactiveConfig?: InteractiveConfig;
  pblConfig?: PBLConfig;
}
```

### 使用示例

```typescript
// 创建幻灯片场景
const result = await api.scene.create({
  type: 'slide',
  title: '第一章：光合作用',
});
if (result.success) {
  console.log('创建成功:', result.data.sceneId);
}

// 创建测验场景
const quizResult = await api.scene.create({
  type: 'quiz',
  title: '课后测验',
  quizConfig: {
    questionCount: 5,
    difficulty: 'medium',
  },
});
```

## Element API (元素操作)

```typescript
interface ElementAPI {
  // 添加元素
  add(sceneId: string, element: CreateElementParams): APIResult<{ elementId: string }>;

  // 获取元素
  get(sceneId: string, elementId: string): PPTElement | undefined;

  // 更新元素
  update(sceneId: string, elementId: string, updates: Partial<PPTElement>): APIResult;

  // 删除元素
  delete(sceneId: string, elementId: string): APIResult;

  // 批量操作
  batchUpdate(sceneId: string, updates: Array<{ id: string; changes: Partial<PPTElement> }>): APIResult;

  // 排序
  bringToFront(sceneId: string, elementId: string): APIResult;
  sendToBack(sceneId: string, elementId: string): APIResult;
}

// 元素创建参数
type CreateElementParams =
  | { type: 'text'; content: string; left: number; top: number; ... }
  | { type: 'image'; src: string; left: number; top: number; ... }
  | { type: 'shape'; path: string; left: number; top: number; ... }
  | { type: 'chart'; chartType: string; data: ChartData; ... }
  | { type: 'latex'; latex: string; ... }
  | { type: 'video'; src: string; ... };
```

### 使用示例

```typescript
// 添加文本元素
const textResult = api.element.add(sceneId, {
  type: 'text',
  content: '光合作用是植物将光能转化为化学能的过程',
  left: 100,
  top: 200,
  width: 400,
  height: 50,
  fontSize: 24,
  color: '#333333',
});

// 添加图片元素
const imageResult = api.element.add(sceneId, {
  type: 'image',
  src: 'img_1',  // PDF 提取的图片 ID
  left: 100,
  top: 100,
  width: 400,
  height: 300,
});
```

## Canvas API (画布/教学效果)

```typescript
interface CanvasAPI {
  // 高亮元素
  highlight(sceneId: string, elementId: string, duration?: number): APIResult;

  // 聚光灯效果
  spotlight(sceneId: string, elementId: string, options?: SpotlightOptions): APIResult;

  // 激光笔效果
  laser(sceneId: string, elementId: string, options?: LaserOptions): APIResult;

  // 缩放到元素
  zoomTo(sceneId: string, elementId: string, scale?: number): APIResult;

  // 清除所有效果
  clearEffects(): void;
}

interface SpotlightOptions {
  radius?: number;      // 聚光灯半径（像素）
  dimness?: number;     // 背景变暗程度 (0-1)
  transition?: number;  // 过渡动画时长（毫秒）
}

interface LaserOptions {
  color?: string;       // 激光颜色
  duration?: number;    // 持续时间（毫秒）
}
```

### 使用示例

```typescript
// 高亮元素 3 秒
api.canvas.highlight(sceneId, 'element_1', 3000);

// 使用聚光灯效果
api.canvas.spotlight(sceneId, 'diagram_1', {
  dimness: 0.7,
  radius: 200,
});

// 激光笔指向
api.canvas.laser(sceneId, 'formula_1', {
  color: '#ff0000',
});
```

## Navigation API (导航控制)

```typescript
interface NavigationAPI {
  // 切换到指定场景
  goTo(sceneId: string): APIResult;

  // 下一场景
  next(): APIResult;

  // 上一场景
  previous(): APIResult;

  // 获取当前场景
  getCurrent(): Scene | undefined;

  // 获取场景索引
  getIndex(sceneId: string): number;
}
```

## Whiteboard API (白板操作)

```typescript
interface WhiteboardAPI {
  // 获取白板场景
  get(): APIResult<Scene>;

  // 添加元素到白板
  addElement(element: CreateElementParams, whiteboardId?: string): APIResult<{ elementId: string }>;

  // 更新白板元素
  updateElement(elementId: string, updates: Partial<PPTElement>): APIResult;

  // 删除白板元素
  deleteElement(elementId: string): APIResult;

  // 清空白板
  clear(): APIResult;
}
```

### 使用示例

```typescript
// 在白板上绘制文本
const wbResult = api.whiteboard.addElement({
  type: 'text',
  content: 'Step 1: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂',
  left: 100,
  top: 100,
  fontSize: 20,
});

// 绘制公式
api.whiteboard.addElement({
  type: 'latex',
  latex: '\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
  left: 100,
  top: 200,
});
```

## Mode API (模式切换)

```typescript
interface ModeAPI {
  // 获取当前模式
  get(): StageMode;  // 'autonomous' | 'playback'

  // 设置模式
  set(mode: StageMode): APIResult;
}

interface StageMetaAPI {
  // 获取舞台信息
  get(): Stage | null;

  // 更新舞台
  update(updates: Partial<Stage>): APIResult;
}
```

## APIResult 类型

```typescript
interface APIResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// 成功结果
{ success: true, data: { sceneId: 'scene_123' } }

// 失败结果
{ success: false, error: 'Scene not found' }
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/api/                                 │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/store/stage.ts (StageStore)                             │
│  - lib/store/canvas.ts (useCanvasStore)                        │
│  - lib/types/stage.ts (Scene, Stage, etc.)                     │
│  - lib/types/slides.ts (PPTElement, etc.)                      │
│                                                                 │
│  被依赖:                                                        │
│  - lib/action/engine.ts (ActionEngine)                         │
│  - lib/orchestration/ (智能体执行动作)                          │
│  - components/ (UI 组件)                                        │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用工厂函数而非单例？

1. **依赖注入**: 可以传入不同的 store 实例
2. **测试友好**: 可以创建 mock store 进行单元测试
3. **灵活性**: 支持多个独立的 Stage 实例

### 为什么返回 APIResult 而非抛出异常？

1. **明确性**: 调用者必须处理失败情况
2. **类型安全**: TypeScript 可以推断成功/失败的数据类型
3. **AI 友好**: 智能体可以根据 success 字段判断执行结果

### 为什么将教学效果放在 Canvas API？

1. **语义一致**: 效果作用于画布元素
2. **状态管理**: 效果状态存储在 CanvasStore
3. **原子操作**: 一个 API 调用完成效果触发
