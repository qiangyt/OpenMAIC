# 类型定义模块 (lib/types/)

> OpenMAIC 全局 TypeScript 类型定义，覆盖场景、动作、聊天、生成等核心领域

## 概览

本模块定义了整个系统的核心数据结构，是各模块间通信的"契约"。

```
┌─────────────────────────────────────────────────────────────────┐
│                      类型依赖关系                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     stage.ts (核心)                              │
│                    /     |      \                               │
│                   /      |       \                              │
│              slides.ts  action.ts  chat.ts                      │
│                  |         |          |                         │
│                  └─────────┼──────────┘                         │
│                            │                                    │
│                     generation.ts                               │
│                            │                                    │
│                     provider.ts                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `stage.ts` | 舞台和场景类型 - Stage、Scene、SceneContent |
| `action.ts` | 动作类型 - 统一的动作系统定义 |
| `chat.ts` | 聊天类型 - 会话、消息、SSE 事件 |
| `slides.ts` | 幻灯片元素 - PPTist 数据结构 |
| `generation.ts` | 生成类型 - 大纲、用户需求、生成内容 |
| `provider.ts` | 提供者类型 - AI 模型配置、Thinking 能力 |
| `settings.ts` | 设置类型 - 提供者配置结构 |
| `edit.ts` | 编辑类型 - 格式化、创建元素 |
| `roundtable.ts` | 圆桌类型 - 多智能体讨论 UI |
| `pdf.ts` | PDF 类型 - 文档处理 |
| `web-search.ts` | 网页搜索类型 |
| `export.ts` | 导出类型 - PPT/PDF 导出 |

## Stage & Scene (stage.ts)

### Stage - 舞台

代表整个课程/课堂的顶层容器：

```typescript
interface Stage {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  language?: string;     // 课程语言
  style?: string;        // 视觉风格
  whiteboard?: Whiteboard[];  // 白板数据
}
```

### Scene - 场景

代表课程中的单个页面/场景：

```typescript
interface Scene {
  id: string;
  stageId: string;       // 父舞台 ID
  type: SceneType;       // 'slide' | 'quiz' | 'interactive' | 'pbl'
  title: string;
  order: number;         // 显示顺序

  // 类型特定的内容
  content: SceneContent;

  // 播放时执行的动作序列
  actions?: Action[];

  // 深度讲解用的白板
  whiteboards?: Slide[];

  // 多智能体讨论配置
  multiAgent?: {
    enabled: boolean;
    agentIds: string[];
    directorPrompt?: string;
  };

  createdAt?: number;
  updatedAt?: number;
}

type SceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';
type StageMode = 'autonomous' | 'playback';
```

### SceneContent - 场景内容

按场景类型分发的内容联合类型：

```typescript
type SceneContent = SlideContent | QuizContent | InteractiveContent | PBLContent;

// 幻灯片内容
interface SlideContent {
  type: 'slide';
  canvas: Slide;  // PPTist 数据结构
}

// 测验内容
interface QuizContent {
  type: 'quiz';
  questions: QuizQuestion[];
}

// 交互式内容
interface InteractiveContent {
  type: 'interactive';
  url: string;
  html?: string;
}

// PBL 内容
interface PBLContent {
  type: 'pbl';
  projectConfig: PBLProjectConfig;
}
```

### QuizQuestion - 测验题目

```typescript
interface QuizQuestion {
  id: string;
  type: 'single' | 'multiple' | 'short_answer';
  question: string;
  options?: QuizOption[];       // 单选/多选题的选项
  answer?: string[];            // 正确答案值: ["A"], ["A","C"], 或文本
  analysis?: string;            // 批改后显示的解析
  commentPrompt?: string;       // 文本题的评分指导
  hasAnswer?: boolean;          // 是否支持自动批改
  points?: number;              // 每题分值 (默认 1)
}

interface QuizOption {
  label: string;  // 显示文本
  value: string;  // 选择键: "A", "B", "C", "D"
}
```

## Action System (action.ts)

### 统一动作系统

所有智能体与演示文稿的交互都通过 Action 完成：

```typescript
type Action =
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
```

### Fire-and-Forget 动作

立即返回，不阻塞后续动作：

```typescript
// 聚光灯 - 高亮单个元素，其他元素变暗
interface SpotlightAction extends ActionBase {
  type: 'spotlight';
  elementId: string;
  dimOpacity?: number;  // 默认 0.5
}

// 激光笔 - 在元素上显示激光效果
interface LaserAction extends ActionBase {
  type: 'laser';
  elementId: string;
  color?: string;  // 默认 '#ff0000'
}

const FIRE_AND_FORGET_ACTIONS: ActionType[] = ['spotlight', 'laser'];
```

### Synchronous 动作

等待完成后才执行下一个动作：

```typescript
// 语音讲解 - 等待 TTS 完成
interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
  audioId?: string;     // 预生成的 TTS 音频 ID
  audioUrl?: string;    // 服务器生成的 TTS URL
  voice?: string;
  speed?: number;       // 默认 1.0
}

// 播放视频 - 等待视频播放完成
interface PlayVideoAction extends ActionBase {
  type: 'play_video';
  elementId: string;
}

// 白板动作
interface WbOpenAction extends ActionBase { type: 'wb_open'; }
interface WbCloseAction extends ActionBase { type: 'wb_close'; }
interface WbClearAction extends ActionBase { type: 'wb_clear'; }
interface WbDeleteAction extends ActionBase { type: 'wb_delete'; elementId: string; }

// 绘制动作
interface WbDrawTextAction extends ActionBase {
  type: 'wb_draw_text';
  elementId?: string;
  content: string;      // HTML 或纯文本
  x: number;
  y: number;
  width?: number;       // 默认 400
  height?: number;      // 默认 100
  fontSize?: number;    // 默认 18
  color?: string;       // 默认 '#333333'
}

interface WbDrawShapeAction extends ActionBase {
  type: 'wb_draw_shape';
  shape: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;   // 默认 '#5b9bd5'
}

interface WbDrawChartAction extends ActionBase {
  type: 'wb_draw_chart';
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
}

interface WbDrawLatexAction extends ActionBase {
  type: 'wb_draw_latex';
  latex: string;
  x: number;
  y: number;
  color?: string;       // 默认 '#000000'
}

// 触发讨论
interface DiscussionAction extends ActionBase {
  type: 'discussion';
  topic: string;
  prompt?: string;
  agentId?: string;
}

const SYNC_ACTIONS: ActionType[] = [
  'speech', 'play_video', 'wb_open', 'wb_draw_text', 'wb_draw_shape',
  'wb_draw_chart', 'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
  'wb_clear', 'wb_delete', 'wb_close', 'discussion',
];
```

### 工具类型

```typescript
// 百分比几何（用于响应式定位）
interface PercentageGeometry {
  x: number;       // 0-100
  y: number;       // 0-100
  w: number;       // 0-100
  h: number;       // 0-100
  centerX: number; // 0-100
  centerY: number; // 0-100
}

// 仅适用于 slide 场景的动作
const SLIDE_ONLY_ACTIONS: ActionType[] = ['spotlight', 'laser'];
```

## Chat Types (chat.ts)

### StatelessChatRequest - 无状态聊天请求

客户端发送的完整请求，包含所有必要状态：

```typescript
interface StatelessChatRequest {
  // 对话历史（客户端维护）
  messages: UIMessage<ChatMessageMetadata>[];

  // 当前应用状态
  storeState: {
    stage: Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
    mode: StageMode;
    whiteboardOpen: boolean;
  };

  // 智能体配置
  config: {
    agentIds: string[];
    sessionType?: 'qa' | 'discussion';
    discussionTopic?: string;
    discussionPrompt?: string;
    triggerAgentId?: string;
    // 动态生成的智能体配置（不在服务端注册表中）
    agentConfigs?: Array<{
      id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      allowedActions: string[];
      priority: number;
    }>;
  };

  // 导演状态（跨请求传递）
  directorState?: DirectorState;

  // API 凭证
  apiKey: string;
  baseUrl?: string;
  model?: string;
}
```

### DirectorState - 导演状态

```typescript
interface DirectorState {
  turnCount: number;
  agentResponses: AgentTurnSummary[];  // 本轮智能体发言摘要
  whiteboardLedger: WhiteboardActionRecord[];  // 白板操作记录
}
```

### StatelessEvent - SSE 事件

```typescript
type StatelessEvent =
  | { type: 'agent_start'; data: { messageId, agentId, agentName, ... } }
  | { type: 'agent_end'; data: { messageId, agentId } }
  | { type: 'text_delta'; data: { content: string; messageId?: string } }
  | { type: 'action'; data: { actionId, actionName, params, agentId, ... } }
  | { type: 'thinking'; data: { stage: 'director' | 'agent_loading'; agentId?: string } }
  | { type: 'cue_user'; data: { fromAgentId?: string } }
  | { type: 'done'; data: { totalActions, totalAgents, directorState?, ... } }
  | { type: 'error'; data: { message: string } };
```

### ChatSession - 聊天会话

```typescript
interface ChatSession {
  id: string;
  type: SessionType;  // 'qa' | 'discussion' | 'lecture'
  title: string;
  status: SessionStatus;
  messages: UIMessage<ChatMessageMetadata>[];
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
}

interface ChatMessageMetadata {
  senderName?: string;
  senderAvatar?: string;
  originalRole?: 'teacher' | 'agent' | 'user';
  actions?: MessageAction[];
  agentId?: string;
  agentColor?: string;
  interrupted?: boolean;
}
```

## Generation Types (generation.ts)

### UserRequirements - 用户需求

```typescript
interface UserRequirements {
  requirement: string;      // 自由文本，包含所有需求细节
  language: 'zh-CN' | 'en-US';
  userNickname?: string;    // 学生昵称（个性化）
  userBio?: string;         // 学生背景（个性化）
  webSearch?: boolean;      // 启用网页搜索丰富上下文
}
```

### SceneOutline - 场景大纲

Stage 1 生成的简化大纲：

```typescript
interface SceneOutline {
  id: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  description: string;      // 1-2 句话描述意图
  keyPoints: string[];      // 3-5 个核心要点
  teachingObjective?: string;
  estimatedDuration?: number;  // 秒
  order: number;
  language?: 'zh-CN' | 'en-US';

  // 建议使用的 PDF 图片
  suggestedImageIds?: string[];

  // AI 生成的媒体请求
  mediaGenerations?: MediaGenerationRequest[];

  // 类型特定配置
  quizConfig?: { ... };
  interactiveConfig?: { ... };
  pblConfig?: { ... };
}
```

### Generated Content Types

```typescript
// 幻灯片内容
interface GeneratedSlideContent {
  elements: PPTElement[];
  background?: SlideBackground;
  remark?: string;
}

// 测验内容
interface GeneratedQuizContent {
  questions: QuizQuestion[];
}

// PBL 内容
interface GeneratedPBLContent {
  projectConfig: PBLProjectConfig;
}

// 交互式内容
interface GeneratedInteractiveContent {
  html: string;
  scientificModel?: ScientificModel;
}

interface ScientificModel {
  core_formulas: string[];
  mechanism: string[];
  constraints: string[];
  forbidden_errors: string[];
}
```

## Provider Types (provider.ts)

### ProviderId

```typescript
type BuiltInProviderId =
  | 'openai' | 'anthropic' | 'google'
  | 'deepseek' | 'qwen' | 'kimi' | 'minimax' | 'glm' | 'siliconflow' | 'doubao';

type ProviderId = BuiltInProviderId | `custom-${string}`;
```

### ThinkingCapability

```typescript
interface ThinkingCapability {
  toggleable: boolean;       // 能否通过 API 禁用
  budgetAdjustable: boolean; // 能否调整思考预算
  defaultEnabled: boolean;   // 默认是否启用
}

interface ThinkingConfig {
  enabled?: boolean;         // true/false/undefined (使用默认)
  budgetTokens?: number;     // 思考预算
}
```

### ModelInfo & ProviderConfig

```typescript
interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  outputWindow?: number;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    thinking?: ThinkingCapability;
  };
}

interface ProviderConfig {
  id: ProviderId;
  name: string;
  type: ProviderType;  // 'openai' | 'anthropic' | 'google'
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  icon?: string;
  models: ModelInfo[];
}

interface ModelConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  proxy?: string;
  providerType?: ProviderType;
}
```

## Slide Element Types (slides.ts)

### PPTElement - 幻灯片元素

```typescript
type PPTElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | LineElement
  | ChartElement
  | LatexElement
  | VideoElement
  | AudioElement
  | TableElement;

interface TextElement extends BaseElement {
  type: 'text';
  content: string;
}

interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
}

interface ShapeElement extends BaseElement {
  type: 'shape';
  path: string;  // SVG 路径
  fill?: string;
}

// ... 其他元素类型
```

## 类型之间的关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                      类型使用关系                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UserRequirements ──→ SceneOutline ──→ Scene                    │
│         │                    │              │                    │
│         │                    │              ├── content          │
│         │                    │              │    ├── SlideContent│
│         │                    │              │    ├── QuizContent │
│         │                    │              │    └── ...         │
│         │                    │              │                    │
│         │                    └──────────────┼── actions: Action[]│
│         │                                   │                    │
│         └───────────────────────────────────┴── language         │
│                                                                 │
│  StatelessChatRequest ──→ DirectorState                         │
│         │                    │                                  │
│         ├── messages[]       └── whiteboardLedger               │
│         ├── storeState             └── WhiteboardActionRecord   │
│         └── config                                           │
│              └── agentConfigs[]: AgentConfig                    │
│                                                                 │
│  ProviderConfig ──→ ModelInfo ──→ ThinkingCapability            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么 Action 是联合类型而非接口继承？

1. **类型安全**: TypeScript 对联合类型的判别式非常高效
2. **不可扩展**: 防止意外添加非法字段
3. **序列化友好**: JSON 序列化后保持完整类型信息

### 为什么使用 SceneContent 联合类型？

1. **类型分发**: 根据 `type` 字段自动推断具体类型
2. **穷尽检查**: switch-case 时编译器会检查是否覆盖所有类型
3. **清晰边界**: 每种场景类型有独立的数据结构

### 为什么 DirectorState 是客户端维护的？

1. **无状态服务端**: 服务端不存储会话状态
2. **可扩展性**: 可以轻松水平扩展服务端
3. **客户端控制**: 客户端可以完全控制对话流程

### 为什么使用 PercentageGeometry？

1. **响应式**: 百分比坐标在不同屏幕尺寸下保持一致
2. **分辨率无关**: 不依赖具体像素值
3. **易于计算**: 直接乘以视口尺寸得到实际坐标
