# OpenMAIC 架构总览

> 基于 AI 的智能课件生成与演示系统

## 系统概述

OpenMAIC 是一个 AI 驱动的智能教学课件生成与演示平台，核心特性：

- **两阶段生成**: 用户需求 → 场景大纲 → 完整可播放场景
- **多智能体编排**: LangGraph 导演模式协调多个 AI 智能体
- **统一动作系统**: 线上流式和离线回放共用动作执行引擎
- **状态机播放**: 播放/暂停/实时讨论多种模式切换

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户界面层                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Stage     │  │  Roundtable │  │   Chat      │  │   Settings          │ │
│  │  (主舞台)    │  │  (圆桌讨论)  │  │  (聊天区)   │  │   (设置面板)        │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────┼────────────────────┼───────────┘
          │                │                │                    │
          ▼                ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              状态管理层 (Zustand)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ StageStore  │  │ CanvasStore │  │SettingsStore│  │ MediaGenerationStore│ │
│  │ - stage     │  │ - selection │  │ - providers │  │ - tasks             │ │
│  │ - scenes    │  │ - viewport  │  │ - agents    │  │ - status            │ │
│  │ - chats     │  │ - effects   │  │ - audio     │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              业务逻辑层                                      │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       Generation Pipeline                             │   │
│  │  ┌─────────────┐       ┌─────────────┐       ┌─────────────────┐     │   │
│  │  │   Stage 1   │       │   Stage 2   │       │    Stage 3      │     │   │
│  │  │  需求→大纲  │ ───→  │  大纲→场景  │ ───→  │  场景→动作序列  │     │   │
│  │  └─────────────┘       └─────────────┘       └─────────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────┐     ┌────────────────────────────────────┐     │
│  │    PlaybackEngine      │     │         ActionEngine               │     │
│  │    (播放状态机)         │ ──→ │         (动作执行)                  │     │
│  │    idle/playing/       │     │    - fire-and-forget (即时效果)    │     │
│  │    paused/live         │     │    - synchronous (等待完成)        │     │
│  └────────────────────────┘     └────────────────────────────────────┘     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Orchestration (LangGraph)                        │   │
│  │  ┌─────────────┐                      ┌─────────────────────────┐    │   │
│  │  │  Director   │ ──(dispatch)──→      │    Agent Generation     │    │   │
│  │  │  (导演节点)  │ ←──(response)──      │    (智能体生成节点)      │    │   │
│  │  └─────────────┘                      └─────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI 提供者层                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         lib/ai/                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │  providers  │  │    llm      │  │  thinking   │                   │   │
│  │  │  (注册表)   │  │  (统一调用)  │  │  (思考适配) │                   │   │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘                   │   │
│  └─────────┼────────────────┼────────────────────────────────────────────┘   │
│            │                │                                                │
│            ▼                ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Vercel AI SDK                                      │   │
│  │  @ai-sdk/openai  │  @ai-sdk/anthropic  │  @ai-sdk/google  │  ...     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API 路由层 (Next.js)                            │
│  app/api/                                                                   │
│  ├── chat/route.ts           # 多智能体聊天                                  │
│  ├── generate/               # 内容生成                                      │
│  │   ├── scene-outlines/     # 场景大纲生成                                  │
│  │   ├── scene-content/      # 场景内容生成                                  │
│  │   └── scene-actions/      # 场景动作生成                                  │
│  ├── media/                  # 媒体生成（图片/视频）                          │
│  ├── audio/                  # 音频服务（TTS/ASR）                           │
│  └── server-providers/       # 服务端提供者配置                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 核心模块详解

### 1. 生成流水线 (lib/generation/)

两阶段课程内容生成系统：

```
用户需求
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: 需求 → 场景大纲 (outline-generator.ts)             │
│  ─────────────────────────────────────────────────────────  │
│  输入: UserRequirements (requirement, language, ...)        │
│  输出: SceneOutline[] (id, type, title, keyPoints, ...)     │
│                                                              │
│  功能:                                                       │
│  - 分析用户需求                                              │
│  - 规划场景结构 (slide/quiz/interactive/pbl)                 │
│  - 分配教学目标                                              │
│  - 决定媒体生成需求                                          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: 大纲 → 完整场景 (scene-generator.ts)               │
│  ─────────────────────────────────────────────────────────  │
│  输入: SceneOutline[]                                        │
│  输出: Scene[] (content, actions, whiteboards, ...)         │
│                                                              │
│  并行处理每个场景:                                           │
│  - slide → generateSlideContent()                           │
│  - quiz → generateQuizContent()                             │
│  - interactive → generateInteractiveContent()               │
│  - pbl → generatePBLSceneContent()                          │
│                                                              │
│  然后生成动作:                                               │
│  - generateSceneActions() → Action[]                        │
└─────────────────────────────────────────────────────────────┘
```

**文档**: [lib/generation/README.md](lib/generation/README.md)

### 2. 多智能体编排 (lib/orchestration/)

基于 LangGraph 的导演模式：

```
START
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│                      Director Node                          │
│  ─────────────────────────────────────────────────────────  │
│  单智能体: 纯代码逻辑                                         │
│    - turnCount === 0 → 派发该智能体                          │
│    - 后续轮次 → 邀请用户发言                                  │
│                                                              │
│  多智能体: LLM 决策                                          │
│    - 构建导演 Prompt (可用智能体、已发言列表、上下文)         │
│    - 解析决策 JSON (next_agent: "id" | "USER" | "END")      │
│    - 快速路径 (首轮、达到最大轮次)                            │
└─────────────────────────────────────────────────────────────┘
  │
  │ shouldEnd=false, currentAgentId=set
  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Agent Generation Node                     │
│  ─────────────────────────────────────────────────────────  │
│  1. 发送 agent_start 事件                                    │
│  2. 构建 System Prompt (角色、上下文、白板状态)              │
│  3. 流式生成 JSON 数组                                       │
│  4. 解析器提取 text_delta 和 action 事件                     │
│  5. 发送 agent_end 事件                                      │
│  6. 返回本轮摘要                                             │
└─────────────────────────────────────────────────────────────┘
  │
  │ 循环
  ▼
Director Node (循环)
  │
  │ shouldEnd=true
  ▼
END
```

**文档**: [lib/orchestration/README.md](lib/orchestration/README.md)

### 3. 播放引擎 (lib/playback/)

状态机驱动的播放控制：

```
                 start()                  pause()
  idle ──────────────────→ playing ──────────────→ paused
    ▲                         ▲                       │
    │                         │  resume()             │
    │                         └───────────────────────┘
    │
    │  handleEndDiscussion()
    │                         confirmDiscussion()
    │                         / handleUserInterrupt()
    │                              │
    │                              ▼         pause()
    └──────────────────────── live ──────────────→ paused
                                ▲                    │
                                │ resume / user msg  │
                                └────────────────────┘
```

**核心职责**：
- 管理播放/暂停/实时讨论状态
- 处理 TTS/浏览器原生语音
- 响应用户中断
- 追踪播放进度

**文档**: [lib/playback/README.md](lib/playback/README.md)

### 4. 动作执行引擎 (lib/action/)

统一动作执行层：

| 动作类型 | 执行模式 | 阻塞? | 示例 |
|---------|---------|------|------|
| spotlight | 即发即忘 | ❌ | 高亮元素 |
| laser | 即发即忘 | ❌ | 激光笔效果 |
| speech | 同步 | ✅ | 语音讲解 |
| play_video | 同步 | ✅ | 视频播放 |
| wb_open | 同步 | ✅ | 打开白板 |
| wb_draw_* | 同步 | ✅ | 白板绘制 |
| discussion | 同步 | ✅ | 触发讨论 |

**文档**: [lib/action/README.md](lib/action/README.md)

### 5. AI 提供者抽象 (lib/ai/)

统一的多厂商 LLM 调用层：

```
┌─────────────────────────────────────────────────────────────┐
│                    callLLM() / streamLLM()                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Thinking Adapter                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Claude     │  │   DeepSeek   │  │     o1       │       │
│  │  thinking:{} │  │ (不可禁用)   │  │ (不可禁用)   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      getModel()                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   OpenAI     │  │  Anthropic   │  │   Google     │       │
│  │ @ai-sdk/     │  │ @ai-sdk/     │  │ @ai-sdk/     │       │
│  │  openai      │  │ anthropic    │  │  google      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  OpenAI 兼容: GLM, Qwen, DeepSeek, Kimi, MiniMax, ...       │
└─────────────────────────────────────────────────────────────┘
```

**文档**: [lib/ai/README.md](lib/ai/README.md)

### 6. 状态管理 (lib/store/)

多 Store Zustand 架构：

| Store | 职责 | 持久化 |
|-------|------|--------|
| StageStore | 舞台、场景、聊天 | IndexedDB |
| CanvasStore | 选择、视口、效果 | 无 |
| SettingsStore | 模型、提供者、布局 | localStorage |
| MediaGenerationStore | 媒体生成任务 | IndexedDB |
| WhiteboardHistoryStore | 白板撤销/重做 | 无 |

**文档**: [lib/store/README.md](lib/store/README.md)

### 7. 类型系统 (lib/types/)

核心类型关系：

```
Stage
├── scenes: Scene[]
│   ├── type: 'slide' | 'quiz' | 'interactive' | 'pbl'
│   ├── content: SceneContent
│   ├── actions: Action[]
│   └── multiAgent?: { enabled, agentIds, ... }
│
├── UserRequirements ──→ SceneOutline
│                          │
│                          ▼
│                     GeneratedContent
│
└── StatelessChatRequest
    ├── messages: UIMessage[]
    ├── storeState: { stage, scenes, ... }
    └── config: { agentIds, agentConfigs, ... }
```

**文档**: [lib/types/README.md](lib/types/README.md)

## 数据流

### 1. 课程生成流程

```
用户输入需求
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/generate/scene-outlines-stream                   │
│  ─────────────────────────────────────────────────────────  │
│  1. 解析 UserRequirements                                   │
│  2. 提取 PDF 内容和图片                                      │
│  3. 调用 generateSceneOutlinesFromRequirements()            │
│  4. SSE 流式返回进度                                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/generate/scene-content (并行)                    │
│  ─────────────────────────────────────────────────────────  │
│  1. 接收 SceneOutline[]                                     │
│  2. 并行调用 generateFullScenes()                           │
│  3. 返回 Scene[] (存储到 StageStore)                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
StageStore.scenes 更新
```

### 2. 实时讨论流程

```
用户发送消息
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/chat (Stateless SSE)                             │
│  ─────────────────────────────────────────────────────────  │
│  请求体: StatelessChatRequest {                             │
│    messages,                                                │
│    storeState: { stage, scenes, currentSceneId, ... },     │
│    config: { agentIds, agentConfigs },                     │
│    directorState                                            │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  statelessGenerate() (LangGraph)                            │
│  ─────────────────────────────────────────────────────────  │
│  循环:                                                       │
│    1. Director 决策下一个发言者                              │
│    2. Agent 生成 (流式 JSON 数组)                            │
│    3. 解析器发送 SSE 事件:                                   │
│       - agent_start                                         │
│       - text_delta                                          │
│       - action                                              │
│       - agent_end                                           │
│    4. 检查 shouldEnd                                        │
│  结束时发送: done { directorState }                          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
客户端 ActionEngine.execute(action)
    │
    ▼
UI 更新 (CanvasStore, StageStore)
```

### 3. 播放回放流程

```
用户点击播放
    │
    ▼
PlaybackEngine.start()
    │
    ▼
processNext() 循环:
    │
    ├── speech 动作
    │   ├── 尝试播放预生成音频
    │   ├── 或使用浏览器 TTS
    │   └── 或使用阅读计时器
    │
    ├── spotlight/laser 动作
    │   └── ActionEngine.execute() (即发即忘)
    │
    ├── wb_* 动作
    │   └── ActionEngine.execute() (等待完成)
    │
    └── discussion 动作
        ├── 3秒延迟
        ├── 显示 ProactiveCard
        └── 等待用户响应
            ├── confirmDiscussion() → live 模式
            └── skipDiscussion() → 继续播放
```

## 技术栈

| 层级 | 技术 |
|-----|------|
| 前端框架 | Next.js 16 (App Router) |
| UI 库 | React 19 |
| 状态管理 | Zustand 5 |
| AI SDK | Vercel AI SDK |
| LLM 编排 | LangGraph |
| 类型 | TypeScript 5 |
| 样式 | Tailwind CSS 4 |
| 动画 | Motion |
| 持久化 | IndexedDB (Dexie) |
| 幻灯片 | PPTist |

## 扩展性设计

### 添加新的动作类型

1. 在 `lib/types/action.ts` 添加类型定义
2. 在 `lib/action/engine.ts` 添加 `executeXxx()` 方法
3. 在 `FIRE_AND_FORGET_ACTIONS` 或 `SYNC_ACTIONS` 中注册
4. 在 `lib/orchestration/tool-schemas.ts` 添加动作描述

### 添加新的 AI 提供者

1. 在 `lib/ai/providers.ts` 的 `PROVIDERS` 中添加配置
2. 在 `lib/types/provider.ts` 添加 ProviderId (如需要)
3. 配置 models 和 capabilities

### 添加新的场景类型

1. 在 `lib/types/stage.ts` 添加 SceneType
2. 定义新的 SceneContent 接口
3. 在 `lib/generation/scene-generator.ts` 添加生成器函数
4. 在 Stage 1 和 Stage 2 Prompt 中添加指导

## 设计原则

1. **无状态服务端**: 所有状态由客户端维护，服务端只处理请求
2. **统一动作系统**: 线上流式和离线回放使用相同的 Action 类型
3. **模块化**: 各模块职责清晰，通过类型定义解耦
4. **渐进式渲染**: 流式响应优先，骨架屏加载

## 文档索引

- [生成流水线](lib/generation/README.md)
- [多智能体编排](lib/orchestration/README.md)
- [播放引擎](lib/playback/README.md)
- [动作执行引擎](lib/action/README.md)
- [AI 提供者抽象](lib/ai/README.md)
- [状态管理](lib/store/README.md)
- [类型系统](lib/types/README.md)
