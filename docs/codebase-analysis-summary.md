# OpenMAIC 代码库分析总结

> 全面的代码库文档体系总览

## 文档体系概览

本文档总结了 OpenMAIC 代码库的完整文档体系，包含 **32 个模块级 README.md** 文件，覆盖所有源代码目录。

---

## 一、文档结构

### 文档层次

```
OpenMAIC/
├── README.md                          # 项目主 README
├── docs/                              # 综合性文档
│   ├── architecture.md                # 系统架构
│   ├── codebase-guide.md              # 代码库指南
│   ├── data-storage.md                # 数据存储
│   └── discussion/                    # 设计讨论
│
├── lib/                               # 核心库 (20 个 README)
│   ├── action/README.md
│   ├── ai/README.md
│   ├── buffer/README.md
│   ├── chat/README.md
│   ├── constants/README.md
│   ├── contexts/README.md
│   ├── export/README.md
│   ├── generation/README.md
│   ├── hooks/README.md
│   ├── i18n/README.md
│   ├── orchestration/README.md
│   ├── pbl/README.md
│   ├── playback/README.md
│   ├── prosemirror/README.md
│   ├── server/README.md
│   ├── storage/README.md
│   ├── store/README.md
│   ├── types/README.md
│   ├── utils/README.md
│   └── web-search/README.md
│
├── app/                               # 应用层 (2 个 README)
│   ├── README.md
│   └── generation-preview/README.md
│
├── components/README.md               # 组件层
├── configs/README.md                  # 配置常量
├── packages/README.md                 # 工作区包
├── skills/README.md                   # OpenClaw 技能
└── community/README.md                # 社区资源
```

---

## 二、核心模块概要

### 2.1 生成流水线 (lib/generation/)

**职责**: 两阶段课程内容生成

| 阶段 | 输入 | 输出 | 核心文件 |
|------|------|------|---------|
| Stage 1 | UserRequirements | SceneOutline[] | `outline-generator.ts` |
| Stage 2 | SceneOutline | Scene | `scene-generator.ts` |

**关键特性**:
- 支持 PDF 内容和图片输入
- 可选网络搜索增强
- 智能体角色自动生成
- 4 种场景类型: slide/quiz/interactive/pbl

### 2.2 多智能体编排 (lib/orchestration/)

**职责**: LangGraph 导演模式协调

```
Director Node → Agent Generation Node → (循环) → END
```

**关键组件**:
- `statelessGenerate()`: 无状态生成入口
- `buildDirectorPrompt()`: 导演决策 Prompt
- `parseAgentResponse()`: JSON 数组流式解析

### 2.3 播放引擎 (lib/playback/)

**职责**: 状态机播放控制

| 状态 | 说明 |
|------|------|
| idle | 初始/结束状态 |
| playing | 正在播放 |
| paused | 暂停 |
| live | 实时讨论 |

### 2.4 动作执行引擎 (lib/action/)

**职责**: 统一动作执行层

| 分类 | 动作类型 | 执行模式 |
|------|---------|---------|
| 即发即忘 | spotlight, laser | 非阻塞 |
| 同步 | speech, play_video, wb_*, discussion | 阻塞 |

### 2.5 AI 提供者抽象 (lib/ai/)

**职责**: 多厂商 LLM 调用统一

**支持厂商**:
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- GLM (智谱)
- DeepSeek
- Kimi (月之暗面)
- MiniMax

---

## 三、状态管理

### Zustand Stores

| Store | 职责 | 持久化 |
|-------|------|--------|
| StageStore | 舞台、场景、聊天 | IndexedDB |
| CanvasStore | 选择、视口、效果 | 内存 |
| SettingsStore | 模型、提供者、布局 | localStorage |
| MediaGenerationStore | 媒体生成任务 | IndexedDB |
| WhiteboardHistoryStore | 白板撤销/重做 | 内存 |
| AgentRegistryStore | 智能体注册表 | IndexedDB |

### 数据流

```
首页输入 → sessionStorage → 生成预览 → IndexedDB → 课堂页面
              ↓
         StageStore
              ↓
         播放/实时讨论
```

---

## 四、类型系统

### 核心类型关系

```
Stage
├── id, name, language, style
├── scenes: Scene[]
│   ├── type: 'slide' | 'quiz' | 'interactive' | 'pbl'
│   ├── content: SceneContent
│   ├── actions: Action[]
│   └── multiAgent?: MultiAgentConfig
└── UserRequirements → SceneOutline → GeneratedContent
```

### 动作类型

28+ 种动作类型，分为：
- **视觉效果**: spotlight, laser, highlight
- **内容播放**: speech, play_video, show_element
- **白板操作**: wb_open, wb_close, wb_draw_*, wb_clear
- **交互触发**: discussion, quiz, interactive

---

## 五、UI 组件

### 组件分类

| 目录 | 文件数 | 说明 |
|------|--------|------|
| slide-renderer/ | 76 | 幻灯片编辑器和渲染器 |
| ui/ | 31 | shadcn/ui 通用组件 |
| ai-elements/ | 30 | Vercel AI SDK 风格组件 |
| settings/ | 16 | 设置面板 |
| scene-renderers/ | 10 | 场景类型渲染器 |
| chat/ | 8 | 聊天组件 |
| whiteboard/ | 3 | 白板组件 |
| agent/ | 4 | 智能体组件 |

---

## 六、API 路由

### 生成 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/generate/scene-outlines-stream` | POST | SSE 流式生成大纲 |
| `/api/generate/scene-content` | POST | 生成场景内容 |
| `/api/generate/scene-actions` | POST | 生成动作序列 |
| `/api/generate/agent-profiles` | POST | 生成智能体配置 |
| `/api/generate/image` | POST | 生成图片 |
| `/api/generate/video` | POST | 生成视频 |
| `/api/generate/tts` | POST | 生成 TTS 音频 |

### 聊天 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/chat` | POST | 多智能体聊天 SSE 流 |

### 工具 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/parse-pdf` | POST | PDF 解析 |
| `/api/web-search` | POST | Tavily 网络搜索 |
| `/api/transcription` | POST | 语音识别 |

---

## 七、配置系统

### 环境变量

```env
# LLM 提供者 (至少配置一个)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENAI_API_KEY=sk-...

# 可选功能
TAVILY_API_KEY=...           # 网络搜索
IMAGE_SEEDREAM_API_KEY=...   # 图片生成
VIDEO_SEEDANCE_API_KEY=...   # 视频生成
TTS_OPENAI_API_KEY=...       # TTS
```

### 服务端配置

`server-providers.yml` 支持更复杂的多提供者配置。

---

## 八、扩展指南

### 添加新动作类型

1. 在 `lib/types/action.ts` 添加类型
2. 在 `lib/action/engine.ts` 实现 `executeXxx()`
3. 注册到 `FIRE_AND_FORGET_ACTIONS` 或 `SYNC_ACTIONS`
4. 更新 `lib/orchestration/tool-schemas.ts`

### 添加新 AI 提供者

1. 在 `lib/ai/providers.ts` 的 `PROVIDERS` 添加配置
2. 配置 `models` 和 `capabilities`
3. 实现 `createClient` 函数

### 添加新场景类型

1. 在 `lib/types/stage.ts` 添加 `SceneType`
2. 定义 `SceneContent` 接口
3. 在 `lib/generation/scene-generator.ts` 添加生成器
4. 更新 Prompt 模板

---

## 九、文档索引

### 核心模块

| 模块 | 文档 |
|------|------|
| 生成流水线 | [lib/generation/README.md](../lib/generation/README.md) |
| 多智能体编排 | [lib/orchestration/README.md](../lib/orchestration/README.md) |
| 播放引擎 | [lib/playback/README.md](../lib/playback/README.md) |
| 动作执行 | [lib/action/README.md](../lib/action/README.md) |
| AI 提供者 | [lib/ai/README.md](../lib/ai/README.md) |
| 状态管理 | [lib/store/README.md](../lib/store/README.md) |
| 类型系统 | [lib/types/README.md](../lib/types/README.md) |

### 工具模块

| 模块 | 文档 |
|------|------|
| ProseMirror 编辑器 | [lib/prosemirror/README.md](../lib/prosemirror/README.md) |
| PPTX 导出 | [lib/export/README.md](../lib/export/README.md) |
| React Hooks | [lib/hooks/README.md](../lib/hooks/README.md) |
| 工具函数 | [lib/utils/README.md](../lib/utils/README.md) |
| 服务端工具 | [lib/server/README.md](../lib/server/README.md) |

### 应用和配置

| 目录 | 文档 |
|------|------|
| App Router | [app/README.md](../app/README.md) |
| 生成预览 | [app/generation-preview/README.md](../app/generation-preview/README.md) |
| UI 组件 | [components/README.md](../components/README.md) |
| 配置常量 | [configs/README.md](../configs/README.md) |
| 工作区包 | [packages/README.md](../packages/README.md) |
| OpenClaw 技能 | [skills/README.md](../skills/README.md) |

---

## 十、统计信息

| 指标 | 数值 |
|------|------|
| 模块 README 文件 | 32 |
| lib/ 子目录 | 20 |
| 组件目录 | 10+ |
| API 路由 | 15+ |
| 动作类型 | 28+ |
| 支持 LLM 厂商 | 7+ |
| 场景类型 | 4 |

---

## 十一、贡献指南

1. **文档优先**: 新模块必须包含 README.md
2. **类型完整**: 所有代码必须有 TypeScript 类型
3. **国际化**: UI 文本使用 `lib/i18n/` 系统
4. **测试**: 核心功能需有单元测试

### 提交规范

```
feat: 添加新功能
fix: 修复 Bug
docs: 文档更新
refactor: 代码重构
test: 测试相关
chore: 构建/工具
```

---

*文档生成日期: 2026-03-20*
