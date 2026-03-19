# 组件目录 (components/)

> React UI 组件库

## 概览

本目录包含应用的所有 React 组件，按功能模块组织。

```
components/
├── slide-renderer/     # 幻灯片渲染器 (76 files)
├── ui/                 # 通用 UI 组件 (31 files)
├── ai-elements/        # AI 交互组件 (30 files)
├── settings/           # 设置面板 (16 files)
├── scene-renderers/    # 场景渲染器 (10 files)
├── chat/               # 聊天组件 (8 files)
├── generation/         # 生成组件 (4 files)
├── agent/              # 智能体组件 (4 files)
├── whiteboard/         # 白板组件 (3 files)
├── stage/              # 舞台组件 (2 files)
├── canvas/             # 画布组件 (2 files)
├── audio/              # 音频组件 (2 files)
├── roundtable/         # 圆桌讨论组件 (1 file)
├── header.tsx          # 顶部导航
├── stage.tsx           # 主舞台
└── user-profile.tsx    # 用户资料
```

## 核心子目录

### slide-renderer/ - 幻灯片渲染器

最复杂的组件模块，包含：
- `Editor/` - 幻灯片编辑器
  - `ScreenCanvas.tsx` - 主画布
  - `ScreenElement.tsx` - 元素渲染
  - `LaserOverlay.tsx` - 激光笔效果
  - `Canvas/` - 画布交互
    - `hooks/` - 拖拽、缩放、旋转等交互 Hooks
    - `Operate/` - 元素操作控制器
    - `AlignmentLine.tsx` - 对齐线
    - `Ruler.tsx` - 标尺
    - `MouseSelection.tsx` - 鼠标选择
- `components/`
  - `element/` - 各类元素组件（文本、图片、形状等）
  - `ThumbnailSlide/` - 缩略图

### ui/ - 通用 UI 组件

基于 shadcn/ui 的组件库：
- `button.tsx`, `input.tsx`, `select.tsx` - 表单组件
- `dialog.tsx`, `alert-dialog.tsx` - 对话框
- `dropdown-menu.tsx`, `context-menu.tsx` - 菜单
- `carousel.tsx`, `tabs.tsx` - 布局组件
- `badge.tsx`, `avatar.tsx` - 展示组件

### ai-elements/ - AI 交互组件

Vercel AI SDK 风格的 AI 交互组件：
- `message.tsx`, `conversation.tsx` - 消息和对话
- `prompt-input.tsx` - 输入框
- `tool.tsx`, `toolbar.tsx` - 工具调用
- `code-block.tsx` - 代码块
- `reasoning.tsx`, `chain-of-thought.tsx` - 思考链
- `sources.tsx`, `inline-citation.tsx` - 引用

### settings/ - 设置面板

- 模型配置
- TTS/ASR 设置
- 媒体生成设置
- 主题设置

### chat/ - 聊天组件

- 消息列表
- 输入框
- 动作显示

### scene-renderers/ - 场景渲染器

不同场景类型的渲染器：
- Slide 场景
- Quiz 场景
- Interactive 场景

## 根组件

### stage.tsx

主舞台组件，整合所有场景显示：
- 场景切换
- 播放控制
- 白板集成

### header.tsx

顶部导航栏：
- 课件信息
- 导出按钮
- 用户菜单
