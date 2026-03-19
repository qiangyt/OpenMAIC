# 生成流水线模块 (lib/generation/)

> 两阶段课程内容生成系统：将用户需求转换为完整的可播放课程场景

## 概览

本模块实现了 OpenMAIC 的核心生成逻辑，采用**两阶段生成流水线**架构：

```
用户需求 ──→ Stage 1 ──→ 场景大纲 ──→ Stage 2 ──→ 完整场景(Scene + Actions)
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `generation-pipeline.ts` | 模块入口，重导出所有公开 API |
| `pipeline-runner.ts` | 顶层流水线编排，创建会话并运行完整流水线 |
| `outline-generator.ts` | **Stage 1**: 从用户需求生成场景大纲 |
| `scene-generator.ts` | **Stage 2**: 从大纲生成完整场景内容 |
| `scene-builder.ts` | 场景构建器，组装完整的 Scene 对象 |
| `action-parser.ts` | 动作解析器，将 LLM 输出转换为 Action[] |
| `prompt-formatters.ts` | Prompt 格式化工具函数 |
| `json-repair.ts` | JSON 修复工具，处理不规范的 LLM 输出 |
| `interactive-post-processor.ts` | 互动场景 HTML 后处理器 |

## 两阶段生成流程

### Stage 1: 需求 → 大纲 (`outline-generator.ts`)

**入口函数**: `generateSceneOutlinesFromRequirements()`

```typescript
async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,  // 用户需求（主题、语言等）
  pdfText: string | undefined,     // PDF 文本内容（可选）
  pdfImages: PdfImage[] | undefined, // PDF 图片（可选）
  aiCall: AICallFn,                // AI 调用函数
  callbacks?: GenerationCallbacks, // 进度回调
  options?: { visionEnabled, imageMapping, ... }
): Promise<GenerationResult<SceneOutline[]>>
```

**处理流程**:

1. **构建图片描述**
   - 如果启用 Vision 模式：前 N 张图片用于视觉识别，其余用文本描述
   - 文本模式：所有图片用 `formatImageDescription()` 生成描述

2. **构建用户画像**
   - 从 `requirements.userNickname` 和 `requirements.userBio` 生成学生画像
   - 用于个性化课程内容难度和示例

3. **媒体生成策略**
   - 根据 `imageGenerationEnabled` 和 `videoGenerationEnabled` 决定是否允许 AI 生成图片/视频

4. **调用 AI 生成大纲**
   - 使用 `requirements-to-outlines` Prompt 模板
   - 解析 JSON 响应为 `SceneOutline[]`

5. **后处理**
   - 为每个大纲分配唯一 ID (`nanoid`)
   - 设置 `order` 和 `language`
   - 调用 `uniquifyMediaElementIds()` 确保媒体 ID 全局唯一

**输出结构** (`SceneOutline`):

```typescript
interface SceneOutline {
  id: string;
  title: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  order: number;
  language: string;
  description?: string;
  teachingGoal?: string;
  keyPoints?: string[];
  duration?: number;
  interactiveConfig?: InteractiveConfig;  // 仅 interactive 类型
  pblConfig?: PBLConfig;                  // 仅 pbl 类型
  mediaGenerations?: MediaGeneration[];   // 需要生成的图片/视频
}
```

### Stage 2: 大纲 → 完整场景 (`scene-generator.ts`)

**入口函数**: `generateFullScenes()` - 并行生成所有场景

```typescript
async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<string[]>>
```

**内部流程** (每个场景):

1. **Step 2.1: 生成内容** - `generateSceneContent()`
   - 根据大纲类型分发到对应的生成器：
     - `slide` → `generateSlideContent()`
     - `quiz` → `generateQuizContent()`
     - `interactive` → `generateInteractiveContent()`
     - `pbl` → `generatePBLSceneContent()`

2. **Step 2.2: 生成动作** - `generateSceneActions()`
   - 根据内容和脚本生成智能体动作序列
   - 使用对应的 Prompt 模板（如 `slide-actions`, `quiz-actions`）

3. **Step 2.3: 组装场景** - `createSceneWithActions()`
   - 将内容和动作组装成完整的 `Scene` 对象
   - 通过 `StageAPI` 存储到 store

**并行策略**:
```typescript
// 所有场景并行生成
const results = await Promise.all(
  sceneOutlines.map(outline => generateSingleScene(outline, api, aiCall))
);
```

## Prompt 模板系统 (`prompts/`)

### 目录结构

```
prompts/
├── index.ts           # 导出 PROMPT_IDS 常量和 loader 函数
├── loader.ts          # Prompt 加载器，支持变量插值和片段组合
├── types.ts           # 类型定义
├── snippets/          # 可复用的 Prompt 片段
│   ├── action-schema.md
│   ├── slide-elements.md
│   └── ...
└── templates/         # Prompt 模板目录
    ├── requirements-to-outlines/
    │   ├── system.md  # System Prompt
    │   └── user.md    # User Prompt 模板
    ├── slide-content/
    ├── slide-actions/
    ├── quiz-content/
    └── ...
```

### Prompt ID 常量

```typescript
const PROMPT_IDS = {
  REQUIREMENTS_TO_OUTLINES: 'requirements-to-outlines',
  SLIDE_CONTENT: 'slide-content',
  QUIZ_CONTENT: 'quiz-content',
  SLIDE_ACTIONS: 'slide-actions',
  QUIZ_ACTIONS: 'quiz-actions',
  INTERACTIVE_SCIENTIFIC_MODEL: 'interactive-scientific-model',
  INTERACTIVE_HTML: 'interactive-html',
  INTERACTIVE_ACTIONS: 'interactive-actions',
  PBL_ACTIONS: 'pbl-actions',
} as const;
```

### 使用方式

```typescript
import { buildPrompt, PROMPT_IDS } from './prompts';

// 构建带变量的 Prompt
const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
  requirement: '学习 Python 基础',
  language: 'zh-CN',
  pdfContent: '...',
  availableImages: '...',
});

// prompts = { system: "...", user: "..." }
```

### 片段组合

Prompt 模板支持 `{{snippet:name}}` 语法引入可复用片段：

```markdown
# system.md
You are an AI course designer.

{{snippet:action-schema}}

{{snippet:slide-elements}}
```

### 变量插值

User Prompt 模板支持 `{{variable}}` 语法：

```markdown
# user.md
## Requirements
{{requirement}}

## Language
{{language}}

## PDF Content
{{pdfContent}}
```

## 动作解析器 (`action-parser.ts`)

将 LLM 的结构化 JSON 输出转换为 `Action[]` 数组。

### 支持的输入格式

**新格式** (推荐):
```json
[
  {"type": "action", "name": "spotlight", "params": {"elementId": "abc"}},
  {"type": "text", "content": "大家好，今天我们学习..."}
]
```

**旧格式** (兼容):
```json
[
  {"type": "action", "tool_name": "spotlight", "parameters": {"elementId": "abc"}},
  {"type": "text", "content": "大家好..."}
]
```

### 解析流程

```typescript
function parseActionsFromStructuredOutput(response: string): Action[] {
  // 1. 去除 markdown 代码块
  const cleaned = stripCodeFences(response);

  // 2. 提取 JSON 数组
  const jsonStr = extractJsonArray(cleaned);

  // 3. 解析 JSON (尝试 JSON.parse → jsonrepair → partial-json)
  const items = parseWithFallback(jsonStr);

  // 4. 转换为 Action[]
  const actions = items.map(item => {
    if (item.type === 'text') return { type: 'speech', text: item.content };
    if (item.type === 'action') return { type: item.name, ...item.params };
  });

  // 5. 后处理
  // - discussion 必须是最后一个动作
  // - 过滤掉非 slide 场景的 slide-only 动作
  // - 按 allowedActions 白名单过滤

  return actions;
}
```

### 解析容错策略

1. **JSON.parse** - 首先尝试标准解析
2. **jsonrepair** - 修复常见错误（如中文引号、未转义字符）
3. **partial-json** - 解析不完整的 JSON（流式响应）

## 图片处理流程

### 图片 ID 解析

AI 生成的图片元素使用占位符 ID，需要解析为实际的 base64 URL：

```typescript
// AI 生成: { type: "image", src: "img_1", ... }
// 解析后: { type: "image", src: "data:image/png;base64,...", ... }

function resolveImageIds(elements, imageMapping, generatedMediaMapping) {
  return elements.map(el => {
    if (el.type === 'image') {
      if (isImageIdReference(el.src)) {
        return { ...el, src: imageMapping[el.src] };
      }
      if (isGeneratedImageId(el.src)) {
        // 保持占位符，前端渲染骨架屏
        return el;
      }
    }
    return el;
  });
}
```

### 图片 ID 类型

| 格式 | 来源 | 处理方式 |
|------|------|----------|
| `img_1`, `img_2` | PDF 提取的图片 | 立即解析为 base64 |
| `gen_img_xK8f2mQ` | AI 生成的图片 | 保持占位符，异步回填 |
| `gen_vid_xK8f2mQ` | AI 生成的视频 | 保持占位符，异步回填 |

## 类型定义 (`pipeline-types.ts`)

```typescript
// 智能体信息（传递给生成流水线）
interface AgentInfo {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

// 跨页面上下文（保持语音连贯性）
interface SceneGenerationContext {
  pageIndex: number;        // 当前页码 (1-based)
  totalPages: number;       // 总页数
  allTitles: string[];      // 所有页面标题
  previousSpeeches: string[]; // 上一页的语音文本
}

// AI 生成的幻灯片数据
interface GeneratedSlideData {
  elements: Array<{
    type: 'text' | 'image' | 'video' | 'shape' | 'chart' | 'latex' | 'line';
    left: number;
    top: number;
    width: number;
    height: number;
    [key: string]: unknown;
  }>;
  background?: { type: 'solid' | 'gradient'; ... };
  remark?: string;
}

// 生成结果
interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 进度回调
interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  onStageComplete?: (stage: 1 | 2 | 3, result: unknown) => void;
  onError?: (error: string) => void;
}

// AI 调用函数签名
type AICallFn = (
  systemPrompt: string,
  userPrompt: string,
  images?: Array<{ id: string; src: string }>
) => Promise<string>;
```

## 场景类型生成器

### Slide 生成 (`generateSlideContent`)

1. 构建 Prompt，包含：
   - 场景大纲信息
   - 可用图片描述
   - 智能体信息（用于个性化语音）

2. 调用 AI 生成 `GeneratedSlideData`

3. 解析图片 ID 引用

4. 转换 LaTeX 公式为 SVG

### Quiz 生成 (`generateQuizContent`)

1. 使用 `quiz-content` Prompt 模板

2. 生成 `GeneratedQuizContent`:
```typescript
interface GeneratedQuizContent {
  questions: QuizQuestion[];
}

interface QuizQuestion {
  id: string;
  type: 'single' | 'multiple' | 'short-answer';
  question: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
}
```

### Interactive 生成 (`generateInteractiveContent`)

1. 根据大纲的 `interactiveConfig.type` 决定生成策略：
   - `scientific-model`: 生成科学模型（物理/化学/生物）
   - 默认: 生成互动 HTML

2. 使用 `postProcessInteractiveHtml()` 后处理：
   - 注入交互脚本
   - 确保样式隔离

### PBL 生成 (`generatePBLSceneContent`)

1. 调用 `lib/pbl/generate-pbl.ts` 生成项目配置

2. 生成 `GeneratedPBLContent`:
```typescript
interface GeneratedPBLContent {
  projectConfig: {
    title: string;
    description: string;
    roles: ProjectRole[];
    milestones: Milestone[];
    deliverables: Deliverable[];
  };
}
```

## 回退机制 (`applyOutlineFallbacks`)

当大纲配置不完整时，自动回退到 `slide` 类型：

```typescript
function applyOutlineFallbacks(outline: SceneOutline, hasLanguageModel: boolean): SceneOutline {
  // interactive 缺少 interactiveConfig → slide
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    return { ...outline, type: 'slide' };
  }

  // pbl 缺少 pblConfig 或 languageModel → slide
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    return { ...outline, type: 'slide' };
  }

  return outline;
}
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                      lib/generation/                            │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/types/ (SceneOutline, Scene, Action, etc.)              │
│  - lib/api/stage-api.ts (StageStore, createStageAPI)           │
│  - lib/pbl/generate-pbl.ts (PBL 内容生成)                       │
│  - lib/constants/generation.ts (常量配置)                       │
│  - lib/logger.ts (日志)                                         │
│                                                                 │
│  被依赖:                                                        │
│  - app/api/generate/scene-outlines-stream/route.ts             │
│  - app/api/generate/scene-content/route.ts                     │
│  - app/api/generate/scene-actions/route.ts                     │
│  - app/api/generate-classroom/route.ts                         │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么采用两阶段生成？

1. **降低单次 LLM 调用的复杂度**：先生成结构化大纲，再填充内容
2. **支持用户干预**：用户可以在大纲生成后调整，再生成内容
3. **并行优化**：内容生成可以并行处理多个场景

### 为什么使用文件系统存储 Prompt？

1. **版本控制友好**：Prompt 变更历史清晰可见
2. **易于调试**：直接查看和编辑 Prompt 文件
3. **片段复用**：通过 `{{snippet:}}` 语法组合可复用片段

### 为什么动作生成与内容生成分离？

1. **职责分离**：内容生成专注于页面元素，动作生成专注于语音和行为
2. **上下文连贯**：动作生成可以使用已生成的内容作为上下文
3. **灵活性**：可以独立调整动作生成逻辑而不影响内容生成
