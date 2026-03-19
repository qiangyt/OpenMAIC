# OpenMAIC 代码库指南

> 完整的源代码文档索引和开发指南

## 项目概览

**OpenMAIC** (Open Multi-Agent Interactive Classroom) 是一个开源 AI 平台，可将任意主题或文档转换为沉浸式多智能体互动课堂体验。

### 核心特性

- **两阶段生成**: 用户需求 → 场景大纲 → 完整可播放场景
- **多智能体编排**: LangGraph 导演模式协调多个 AI 智能体
- **统一动作系统**: 28+ 种动作类型，支持实时流式和离线回放
- **状态机播放**: 播放/暂停/实时讨论多种模式切换
- **多 LLM 支持**: OpenAI、Anthropic、Google、GLM、DeepSeek 等

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 |
| 状态管理 | Zustand 5 |
| AI SDK | Vercel AI SDK + LangGraph |
| 样式 | Tailwind CSS 4 |
| 持久化 | IndexedDB (Dexie) |
| 包管理 | pnpm 10.28.0 |
| 运行时 | Node.js >= 20.9.0 |

---

## 目录结构

```
OpenMAIC/
├── app/                    # Next.js App Router
│   ├── api/                # API 路由
│   ├── classroom/          # 课堂页面
│   └── page.tsx            # 首页
├── lib/                    # 核心业务逻辑
│   ├── action/             # 动作执行引擎
│   ├── ai/                 # AI 提供者抽象
│   ├── buffer/             # SSE 流缓冲
│   ├── chat/               # 聊天工具
│   ├── constants/          # 全局常量
│   ├── contexts/           # React Context
│   ├── export/             # PPTX 导出
│   ├── generation/         # 生成流水线
│   ├── hooks/              # 自定义 Hooks
│   ├── i18n/               # 国际化
│   ├── orchestration/      # 多智能体编排
│   ├── pbl/                # PBL 生成
│   ├── playback/           # 播放引擎
│   ├── prosemirror/        # 富文本编辑
│   ├── server/             # 服务端工具
│   ├── storage/            # 存储抽象
│   ├── store/              # Zustand Store
│   ├── types/              # TypeScript 类型
│   ├── utils/              # 工具函数
│   └── web-search/         # 网络搜索
├── components/             # React UI 组件
│   ├── slide-renderer/     # 幻灯片渲染器
│   ├── ui/                 # 通用 UI 组件
│   ├── ai-elements/        # AI 交互组件
│   ├── settings/           # 设置面板
│   ├── scene-renderers/    # 场景渲染器
│   ├── chat/               # 聊天组件
│   └── ...                 # 其他组件
├── configs/                # 共享配置常量
├── packages/               # 工作区包
│   ├── mathml2omml/        # MathML 转 OMML
│   └── pptxgenjs/          # PowerPoint 生成
├── skills/                 # OpenClaw 技能
├── community/              # 社区资源
├── docs/                   # 文档
└── public/                 # 静态资源
```

---

## 模块文档索引

### 核心模块 (lib/)

| 模块 | 说明 | 文档 |
|------|------|------|
| **generation/** | 两阶段课程内容生成流水线 | [README.md](../lib/generation/README.md) |
| **orchestration/** | LangGraph 多智能体编排 | [README.md](../lib/orchestration/README.md) |
| **playback/** | 状态机播放引擎 | [README.md](../lib/playback/README.md) |
| **action/** | 28+ 种动作执行引擎 | [README.md](../lib/action/README.md) |
| **ai/** | 多厂商 LLM 提供者抽象 | [README.md](../lib/ai/README.md) |
| **store/** | Zustand 状态管理 | [README.md](../lib/store/README.md) |
| **types/** | TypeScript 类型定义 | [README.md](../lib/types/README.md) |
| **prosemirror/** | ProseMirror 富文本编辑 | [README.md](../lib/prosemirror/README.md) |
| **export/** | PPTX 导出 | [README.md](../lib/export/README.md) |
| **hooks/** | 自定义 React Hooks | [README.md](../lib/hooks/README.md) |
| **utils/** | 工具函数 (IndexedDB, 音频等) | [README.md](../lib/utils/README.md) |
| **server/** | 服务端工具 | [README.md](../lib/server/README.md) |
| **pbl/** | PBL 问题驱动学习 | [README.md](../lib/pbl/README.md) |
| **i18n/** | 国际化系统 | [README.md](../lib/i18n/README.md) |
| **web-search/** | Tavily 网络搜索 | [README.md](../lib/web-search/README.md) |
| **contexts/** | React Context | [README.md](../lib/contexts/README.md) |
| **storage/** | 存储抽象层 | [README.md](../lib/storage/README.md) |
| **buffer/** | SSE 流缓冲器 | [README.md](../lib/buffer/README.md) |
| **constants/** | 全局常量 | [README.md](../lib/constants/README.md) |
| **chat/** | 聊天工具 | [README.md](../lib/chat/README.md) |

### 应用层 (app/)

| 目录 | 说明 | 文档 |
|------|------|------|
| **app/api/** | API 路由 | [README.md](../app/README.md) |
| **app/classroom/** | 课堂页面 | [README.md](../app/README.md) |
| **app/generation-preview/** | 生成预览页面 | [README.md](../app/generation-preview/README.md) |

### 组件层 (components/)

| 目录 | 说明 | 文档 |
|------|------|------|
| **slide-renderer/** | 幻灯片渲染器 (76 文件) | [README.md](../components/README.md) |
| **ui/** | shadcn/ui 通用组件 (31 文件) | [README.md](../components/README.md) |
| **ai-elements/** | Vercel AI SDK 风格组件 (30 文件) | [README.md](../components/README.md) |
| **settings/** | 设置面板 (16 文件) | [README.md](../components/README.md) |
| **scene-renderers/** | 场景渲染器 (10 文件) | [README.md](../components/README.md) |
| **chat/** | 聊天组件 (8 文件) | [README.md](../components/README.md) |

### 配置和工具

| 目录 | 说明 | 文档 |
|------|------|------|
| **configs/** | 共享配置常量 | [README.md](../configs/README.md) |
| **packages/** | pnpm 工作区包 | [README.md](../packages/README.md) |
| **skills/** | OpenClaw 技能 | [README.md](../skills/README.md) |
| **community/** | 社区资源 | [README.md](../community/README.md) |

### 文档

| 文件 | 说明 |
|------|------|
| [architecture.md](architecture.md) | 系统架构总览 |
| [data-storage.md](data-storage.md) | 数据存储方案 |

---

## 快速开始

### 1. 安装依赖

```bash
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，配置至少一个 LLM 提供者：

```env
# 选项 1: Anthropic (推荐)
ANTHROPIC_API_KEY=sk-ant-...

# 选项 2: Google (更好的速度/成本平衡)
GOOGLE_API_KEY=...
DEFAULT_MODEL=google:gemini-3-flash-preview

# 选项 3: OpenAI
OPENAI_API_KEY=sk-...
DEFAULT_MODEL=openai:gpt-4o-mini
```

### 3. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

### 4. 验证健康状态

```bash
curl http://localhost:3000/api/health
```

---

## 开发指南

### 代码风格

- **TypeScript**: 严格模式，所有代码都有类型
- **React**: 函数组件 + Hooks
- **状态管理**: Zustand，避免 prop drilling
- **样式**: Tailwind CSS，组件级封装
- **命名**: camelCase (变量/函数), PascalCase (组件/类型/类)

### 目录约定

| 目录 | 用途 |
|------|------|
| `lib/` | 纯业务逻辑，框架无关 |
| `components/` | React 组件 |
| `app/` | Next.js 路由和 API |
| `configs/` | 共享配置常量 |
| `packages/` | 独立包 |

### 添加新功能

1. **新动作类型**
   - 在 `lib/types/action.ts` 添加类型
   - 在 `lib/action/engine.ts` 实现 `executeXxx()`
   - 在 `lib/orchestration/tool-schemas.ts` 添加描述

2. **新 AI 提供者**
   - 在 `lib/ai/providers.ts` 添加配置
   - 在 `lib/types/provider.ts` 添加 ProviderId

3. **新场景类型**
   - 在 `lib/types/stage.ts` 添加 SceneType
   - 在 `lib/generation/scene-generator.ts` 添加生成器

### 测试

```bash
# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# Lint
pnpm lint
```

---

## 架构概览

### 生成流水线

```
用户需求 → Stage 1 (场景大纲) → Stage 2 (完整场景) → 动作序列
```

- **Stage 1**: 分析需求，规划场景结构
- **Stage 2**: 并行生成每个场景的完整内容
- **Stage 3**: 生成动作序列用于播放

### 多智能体编排

```
Director (导演节点)
    ↓ dispatch
Agent Generation (智能体生成节点)
    ↓ response
Director (循环直到 END)
```

- 单智能体: 纯代码逻辑
- 多智能体: LLM 决策下一个发言者

### 播放引擎

```
idle → playing → paused
         ↓
       live (实时讨论)
```

### 动作执行

| 类型 | 执行模式 | 阻塞 |
|------|---------|------|
| spotlight, laser | 即发即忘 | ❌ |
| speech, play_video | 同步 | ✅ |
| wb_*, discussion | 同步 | ✅ |

---

## 常见问题

### Q: 如何添加新的 LLM 提供者？

在 `lib/ai/providers.ts` 中添加：

```typescript
export const PROVIDERS: ProviderRegistry = {
  'new-provider': {
    id: 'new-provider',
    name: 'New Provider',
    models: ['model-1', 'model-2'],
    capabilities: { thinking: false },
    createClient: (config) => createOpenAICompatible({ ... }),
  },
};
```

### Q: 如何持久化课堂数据？

课堂数据自动保存到 IndexedDB (Dexie)。查看 `lib/utils/db.ts` 了解数据库结构。

### Q: 如何导出为 PPTX？

使用 `lib/export/` 模块：

```typescript
import { exportToPPTX } from '@/lib/export';

const blob = await exportToPPTX(stage, scenes);
```

### Q: 如何启用网络搜索？

配置 `TAVILY_API_KEY`，然后在生成请求中设置 `enableWebSearch: true`。

---

## 贡献指南

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 提交规范

使用 Conventional Commits:

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具相关

---

## 许可证

MIT License - 详见 [LICENSE](../LICENSE) 文件。

---

## 联系方式

- **GitHub**: https://github.com/THU-MAIC/OpenMAIC
- **托管服务**: https://open.maic.chat
- **社区**: 加入飞书群 (见 [community/feishu.md](../community/feishu.md))
