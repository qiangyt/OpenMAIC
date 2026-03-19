# 生成预览页面 (app/generation-preview/)

> 课件生成过程的可视化预览页面

## 概览

本目录包含课件生成预览页面，显示生成进度和各个阶段的可视化效果。

```
app/generation-preview/
├── page.tsx              # 主页面组件
├── layout.tsx            # 布局组件
├── types.ts              # 类型和常量定义
└── components/
    └── visualizers.tsx   # 步骤可视化组件
```

## 核心文件

### page.tsx - 主页面

生成预览的主组件，负责协调整个生成流程。

**主要功能**:

1. **会话管理**
   - 从 `sessionStorage` 加载 `GenerationSessionState`
   - 处理 PDF 解析、网络搜索、大纲生成等步骤

2. **生成流程**
   ```typescript
   // 生成步骤
   1. PDF 解析 (可选)
   2. 网络搜索 (可选)
   3. 智能体生成 (可选)
   4. 场景大纲生成
   5. 场景内容生成
   6. 动作序列生成
   7. TTS 生成 (可选)
   ```

3. **状态管理**
   - `session`: 当前生成会话状态
   - `streamingOutlines`: 流式接收的大纲
   - `webSearchSources`: 网络搜索结果
   - `generatedAgents`: 生成的智能体

**关键 API 调用**:
- `POST /api/parse-pdf` - PDF 解析
- `POST /api/web-search` - 网络搜索
- `POST /api/generate/agent-profiles` - 智能体生成
- `POST /api/generate/scene-outlines-stream` - 大纲流式生成
- `POST /api/generate/scene-content` - 场景内容
- `POST /api/generate/scene-actions` - 动作序列
- `POST /api/generate/tts` - TTS 生成

### types.ts - 类型定义

定义生成会话状态和步骤类型。

```typescript
// 会话状态
interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfImages?: PdfImage[];
  sceneOutlines?: SceneOutline[] | null;
  currentStep: 'generating' | 'complete';
  // PDF 延迟解析
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  // 网络搜索
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
}

// 生成步骤
type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'analysis' | 'writing' | 'visual';
};
```

**预定义步骤** (`ALL_STEPS`):
| ID | 标题 | 类型 |
|----|------|------|
| `pdf-analysis` | PDF 分析 | analysis |
| `web-search` | 网络搜索 | analysis |
| `agent-generation` | 智能体生成 | writing |
| `outline` | 场景大纲 | writing |
| `slide-content` | 幻灯片内容 | visual |
| `actions` | 动作序列 | visual |

### components/visualizers.tsx - 可视化组件

为每个生成步骤提供动态可视化效果。

```typescript
// 主入口组件
function StepVisualizer({
  stepId,
  outlines,
  webSearchSources,
}): JSX.Element | null
```

**可视化组件**:

| 组件 | 步骤 | 效果 |
|------|------|------|
| `PdfScanVisualizer` | pdf-analysis | 文档扫描激光线动画 |
| `WebSearchVisualizer` | web-search | 搜索结果列表动画 |
| `StreamingOutlineVisualizer` | outline | 大纲流式显示 |
| `AgentGenerationVisualizer` | agent-generation | 智能体卡片动画 |
| `ContentVisualizer` | slide-content | 4种场景类型轮播 |
| `ActionsVisualizer` | actions | 动作时间线动画 |

**ContentVisualizer 场景类型**:
- SLIDE (蓝色) - 幻灯片预览
- QUIZ (紫色) - 选择题界面
- PBL (琥珀色) - 问题驱动学习看板
- WEB (绿色) - 交互式网页

## 数据流

```
首页 (输入需求)
    │
    ▼ sessionStorage.setItem('generationSession', ...)
┌─────────────────────────────────────────┐
│          Generation Preview             │
│  ─────────────────────────────────────  │
│  1. 加载会话状态                         │
│  2. 解析 PDF (如有)                      │
│  3. 网络搜索 (如启用)                    │
│  4. 生成智能体 (如 auto 模式)            │
│  5. SSE 流式生成大纲                     │
│  6. 生成第一个场景内容                   │
│  7. 生成动作序列                         │
│  8. TTS 生成 (如启用)                    │
└─────────────────────────────────────────┘
    │
    ▼ router.push(`/classroom/${stageId}`)
课堂页面
```

## 动画实现

使用 Motion (Framer Motion) 实现所有动画效果：

```typescript
// 示例：扫描激光动画
<motion.div
  className="absolute inset-x-0 h-[2px] bg-gradient-to-r ..."
  animate={{ top: ['5%', '90%', '5%'] }}
  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
/>

// 示例：结果高亮滑动
<motion.div
  className="absolute left-2 right-2 rounded-lg bg-teal-500/[0.06]"
  animate={{ y: activeResult * ROW_H }}
  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
/>
```

## 错误处理

- **AbortError**: 导航离开时正常中断，不显示错误
- **API 错误**: 显示错误消息，提供返回重试按钮
- **TTS 失败**: 记录警告，继续生成（非阻塞）

## 与其他模块的关系

```
app/generation-preview/
    │
    ├── 依赖: lib/store/stage.ts (状态管理)
    │         lib/store/settings.ts (设置)
    │         lib/orchestration/registry/store.ts (智能体)
    │         lib/utils/image-storage.ts (图片存储)
    │         lib/hooks/use-i18n.tsx (国际化)
    │
    └── 被导航: app/page.tsx (首页)
         导航到: app/classroom/[id] (课堂页面)
```
