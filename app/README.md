# Next.js App Router (app/)

> Next.js 14 App Router 应用目录

## 概览

本目录使用 Next.js App Router 组织应用路由和 API。

```
app/
├── api/                    # API 路由
│   ├── generate/           # 生成 API
│   │   ├── scene-outlines-stream/  # 场景大纲流式生成
│   │   ├── scene-content/          # 场景内容生成
│   │   ├── scene-actions/          # 场景动作生成
│   │   ├── agent-profiles/         # 智能体配置生成
│   │   ├── image/                  # 图片生成
│   │   ├── video/                  # 视频生成
│   │   └── tts/                    # TTS 生成
│   ├── chat/               # 聊天 API
│   ├── pbl/                # PBL API
│   ├── classroom/          # 课堂 API
│   ├── generate-classroom/ # 课堂生成 API
│   ├── parse-pdf/          # PDF 解析
│   ├── transcription/      # 语音识别
│   ├── web-search/         # 网络搜索
│   ├── proxy-media/        # 媒体代理
│   └── ...                 # 其他 API
├── classroom/              # 课堂页面
├── generation-preview/     # 生成预览页面
├── layout.tsx              # 根布局
├── page.tsx                # 首页
└── globals.css             # 全局样式
```

## API 路由

### 生成 API (/api/generate/)

| 路由 | 方法 | 功能 |
|------|------|------|
| `/scene-outlines-stream` | POST | 流式生成场景大纲 |
| `/scene-content` | POST | 生成场景内容 |
| `/scene-actions` | POST | 生成场景动作 |
| `/agent-profiles` | POST | 生成智能体配置 |
| `/image` | POST | 生成图片 |
| `/video` | POST | 生成视频 |
| `/tts` | POST | 生成 TTS 音频 |

### 聊天 API (/api/chat/)

| 路由 | 方法 | 功能 |
|------|------|------|
| `/chat` | POST | 多智能体聊天流 |

### 课堂 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/classroom` | GET/POST | 课堂 CRUD |
| `/classroom-media/[id]/[...path]` | GET | 课堂媒体代理 |
| `/generate-classroom` | POST | 完整课堂生成 |
| `/generate-classroom/[jobId]` | GET | 查询生成状态 |

### 工具 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/parse-pdf` | POST | 解析 PDF 文件 |
| `/transcription` | POST | 语音识别 |
| `/web-search` | POST | Tavily 网络搜索 |
| `/proxy-media` | GET | 代理媒体文件 |

### 验证 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/verify-model` | POST | 验证 LLM 模型 |
| `/verify-image-provider` | POST | 验证图片生成器 |
| `/verify-video-provider` | POST | 验证视频生成器 |
| `/verify-pdf-provider` | POST | 验证 PDF 解析器 |

## 页面路由

### 首页 (/)

`page.tsx` - 主页面，包含：
- 课件列表
- 新建课件入口
- 设置面板

### 课堂页面 (/classroom/[id])

课堂播放和编辑页面。

### 生成预览 (/generation-preview)

课件生成预览页面。

## 根布局

`layout.tsx` 提供：
- 全局 Providers
- 主题配置
- 元数据配置

## API 响应格式

所有 API 使用统一格式：

```typescript
// 成功
{ success: true, data: { ... } }

// 错误
{ success: false, errorCode: '...', error: '...' }
```

## 认证

API 通过请求头传递配置：
- `x-model`: 模型字符串
- `x-api-key`: API Key
- `x-base-url`: API Base URL
- `x-provider-type`: 提供者类型
