# 服务端工具模块 (lib/server/)

> 服务端专用工具函数和配置管理

## 概览

本模块提供服务端专用的工具函数，包括 API 响应处理、配置管理、SSRF 防护、课堂生成等。**此模块只能在服务端使用**，包含 Node.js 专用 API。

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/server/                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   核心工具                               │   │
│  │  - api-response.ts       统一 API 响应格式              │   │
│  │  - provider-config.ts    提供者配置加载                 │   │
│  │  - resolve-model.ts      模型配置解析                   │   │
│  │  - ssrf-guard.ts         SSRF 攻击防护                  │   │
│  │  - proxy-fetch.ts        代理请求                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   课堂生成                               │   │
│  │  - classroom-generation.ts    课堂生成流水线             │   │
│  │  - classroom-job-store.ts     任务状态存储              │   │
│  │  - classroom-job-runner.ts    任务执行器                │   │
│  │  - classroom-media-generation.ts 媒体生成               │   │
│  │  - classroom-storage.ts       持久化存储                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `api-response.ts` | 统一 API 响应格式 |
| `provider-config.ts` | 从 YAML/环境变量加载提供者配置 |
| `resolve-model.ts` | 解析模型配置字符串 |
| `ssrf-guard.ts` | SSRF 攻击防护 |
| `proxy-fetch.ts` | 带代理的 fetch |
| `classroom-generation.ts` | 课堂完整生成流水线 |
| `classroom-job-store.ts` | 任务状态存储 |
| `classroom-job-runner.ts` | 任务执行器 |
| `classroom-media-generation.ts` | 媒体文件生成 |
| `classroom-storage.ts` | 持久化存储 |

## API 响应工具 (api-response.ts)

### 使用方式

```typescript
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

// 成功响应
export async function GET() {
  const data = await fetchData();
  return apiSuccess({ data });
  // { success: true, data: [...] }
}

// 错误响应
export async function POST(request: Request) {
  const body = await request.json();

  if (!body.required) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing required field: required'
    );
    // { success: false, errorCode: 'MISSING_REQUIRED_FIELD', error: '...' }
  }

  // 业务逻辑...
}
```

### 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| `MISSING_REQUIRED_FIELD` | 400 | 缺少必填字段 |
| `MISSING_API_KEY` | 401 | 缺少 API Key |
| `INVALID_REQUEST` | 400 | 无效请求 |
| `INVALID_URL` | 400 | 无效 URL |
| `REDIRECT_NOT_ALLOWED` | 403 | 不允许重定向 |
| `CONTENT_SENSITIVE` | 400 | 内容敏感 |
| `UPSTREAM_ERROR` | 502 | 上游服务错误 |
| `GENERATION_FAILED` | 500 | 生成失败 |
| `TRANSCRIPTION_FAILED` | 500 | 转录失败 |
| `PARSE_FAILED` | 500 | 解析失败 |
| `INTERNAL_ERROR` | 500 | 内部错误 |

## 提供者配置 (provider-config.ts)

### 配置来源优先级

```
YAML 文件 (providers.yaml) → 环境变量 → 运行时请求头
```

### YAML 配置示例

```yaml
# providers.yaml
providers:
  openai:
    apiKey: sk-xxx
    baseUrl: https://api.openai.com/v1
    models:
      - gpt-4o
      - gpt-4o-mini
  anthropic:
    apiKey: sk-ant-xxx
    baseUrl: https://api.anthropic.com/v1

tts:
  openai-tts:
    apiKey: sk-xxx
  azure-tts:
    apiKey: xxx
    baseUrl: https://xxx.cognitiveservices.azure.com

asr:
  openai-whisper:
    apiKey: sk-xxx

image:
  seedream:
    apiKey: xxx
    baseUrl: https://ark.cn-beijing.volces.com

video:
  kling:
    apiKey: xxx
    baseUrl: https://api.klingai.com

web-search:
  tavily:
    apiKey: tvly-xxx
```

### 环境变量映射

```bash
# LLM 提供者
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
DEEPSEEK_API_KEY=sk-xxx
QWEN_API_KEY=sk-xxx

# TTS 提供者
TTS_OPENAI_API_KEY=sk-xxx
TTS_AZURE_API_KEY=xxx

# ASR 提供者
ASR_OPENAI_API_KEY=sk-xxx

# 图片生成
IMAGE_SEEDREAM_API_KEY=xxx

# 视频生成
VIDEO_KLING_API_KEY=xxx

# 网络搜索
TAVILY_API_KEY=tvly-xxx
```

### 使用方式

```typescript
import {
  resolveApiKey,
  resolveTTSConfig,
  resolveASRConfig,
  resolveImageConfig,
  resolveVideoConfig,
  resolveWebSearchApiKey,
} from '@/lib/server/provider-config';

// 解析 LLM API Key
const apiKey = resolveApiKey('openai');
// 优先级: providers.yaml > OPENAI_API_KEY 环境变量 > 请求头

// 解析 TTS 配置
const ttsConfig = resolveTTSConfig('openai-tts');
// { apiKey, baseUrl, ... }

// 解析图片生成配置
const imageConfig = resolveImageConfig('seedream');
// { apiKey, baseUrl, models, proxy }

// 解析网络搜索配置
const webSearchKey = resolveWebSearchApiKey('tavily');
```

## 模型解析 (resolve-model.ts)

```typescript
import { resolveModel } from '@/lib/server/resolve-model';

// 从请求头解析模型配置
const config = resolveModel(request.headers);
// {
//   providerId: 'openai',
//   modelId: 'gpt-4o',
//   apiKey: 'sk-xxx',
//   baseUrl: 'https://api.openai.com/v1',
//   providerType: 'openai',
//   requiresApiKey: true,
// }

// 支持的模型字符串格式
// - "openai:gpt-4o"
// - "anthropic:claude-sonnet-4-20250514"
// - "openai:gpt-4o,anthropic:claude-sonnet-4" (多模型回退)
```

## SSRF 防护 (ssrf-guard.ts)

```typescript
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

// 验证 URL 安全性
const error = validateUrlForSSRF(userProvidedUrl);
if (error) {
  return apiError(API_ERROR_CODES.INVALID_URL, 400, error);
}

// 被阻止的地址
// - localhost, 127.0.0.1, ::1, 0.0.0.0
// - 10.x.x.x (私有网络 A 类)
// - 172.16.x.x - 172.31.x.x (私有网络 B 类)
// - 192.168.x.x (私有网络 C 类)
// - 169.254.x.x (链路本地)
// - *.local (本地域名)
// - fd* / fe80* (IPv6 本地)
```

## 代理请求 (proxy-fetch.ts)

```typescript
import { proxyFetch } from '@/lib/server/proxy-fetch';

// 使用代理发起请求
const response = await proxyFetch('https://example.com/api', {
  method: 'POST',
  body: JSON.stringify(data),
  headers: { 'Content-Type': 'application/json' },
});

// 自动从环境变量读取代理配置
// HTTP_PROXY, HTTPS_PROXY, NO_PROXY
```

## 课堂生成 (classroom-generation.ts)

### 使用方式

```typescript
import {
  generateClassroom,
  type GenerateClassroomInput,
  type GenerateClassroomResult,
  type ClassroomGenerationProgress,
} from '@/lib/server/classroom-generation';

// 输入参数
const input: GenerateClassroomInput = {
  requirement: '讲解光合作用的过程',
  pdfContent: { text: 'PDF 内容...', images: [] },
  language: 'zh-CN',
  enableWebSearch: true,
  enableImageGeneration: true,
  enableVideoGeneration: false,
  enableTTS: true,
};

// 生成课堂（带进度回调）
const result = await generateClassroom(input, (progress) => {
  console.log(`${progress.step}: ${progress.progress}%`);
  console.log(progress.message);
});

// 结果
// {
//   id: 'classroom_abc123',
//   url: '/classroom/abc123',
//   stage: { ... },
//   scenes: [ ... ],
//   scenesCount: 5,
//   createdAt: '2024-01-01T00:00:00Z',
// }
```

### 生成步骤

```typescript
type ClassroomGenerationStep =
  | 'initializing'         // 初始化
  | 'researching'          // 网络搜索（可选）
  | 'generating_outlines'  // 生成大纲
  | 'generating_scenes'    // 生成场景
  | 'generating_media'     // 生成媒体（可选）
  | 'generating_tts'       // 生成语音（可选）
  | 'persisting'           // 持久化存储
  | 'completed';           // 完成
```

### 生成流程

```
generateClassroom(input)
       │
       ├─ 1. initializing
       │      └── 创建内存 Store
       │
       ├─ 2. researching (可选)
       │      └── Tavily 网络搜索
       │
       ├─ 3. generating_outlines
       │      └── generateSceneOutlinesFromRequirements()
       │
       ├─ 4. generating_scenes (循环)
       │      ├── generateSceneContent()
       │      └── generateSceneActions()
       │
       ├─ 5. generating_media (可选)
       │      └── generateMediaForClassroom()
       │
       ├─ 6. generating_tts (可选)
       │      └── generateTTSForClassroom()
       │
       ├─ 7. persisting
       │      └── persistClassroom()
       │
       └─ 8. completed
              └── 返回结果
```

## 任务存储 (classroom-job-store.ts)

```typescript
import {
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
} from '@/lib/server/classroom-job-store';

// 创建任务
const jobId = createJob({
  requirement: '...',
  language: 'zh-CN',
});

// 查询任务状态
const job = getJob(jobId);
// {
//   id: jobId,
//   status: 'running',
//   progress: { step: 'generating_scenes', progress: 50, message: '...' },
//   result: null,
// }

// 更新进度
updateJobProgress(jobId, {
  step: 'generating_media',
  progress: 70,
  message: '正在生成图片...',
});

// 完成任务
completeJob(jobId, result);

// 任务失败
failJob(jobId, 'Generation failed');
```

## 媒体生成 (classroom-media-generation.ts)

```typescript
import {
  generateMediaForClassroom,
  generateTTSForClassroom,
  replaceMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';

// 生成媒体文件
await generateMediaForClassroom(stageId, scenes, {
  enableImage: true,
  enableVideo: true,
});

// 生成 TTS
await generateTTSForClassroom(stageId, scenes, {
  providerId: 'openai-tts',
  voice: 'alloy',
});

// 替换占位符
const updatedScenes = replaceMediaPlaceholders(scenes, mediaMap);
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/server/                              │
├─────────────────────────────────────────────────────────────────┤
│  依赖 (Node.js 专用):                                          │
│  - fs, path (文件系统)                                         │
│  - js-yaml (YAML 解析)                                         │
│  - next/server (NextResponse)                                  │
│                                                                 │
│  依赖 (内部模块):                                               │
│  - lib/ai/* (LLM 调用)                                         │
│  - lib/api/* (Stage API)                                       │
│  - lib/generation/* (生成流水线)                               │
│  - lib/media/* (媒体生成)                                      │
│  - lib/audio/* (TTS 生成)                                      │
│  - lib/web-search/* (网络搜索)                                 │
│                                                                 │
│  被依赖:                                                        │
│  - app/api/* (API 路由)                                        │
│                                                                 │
│  ⚠️ 注意: 此模块只能在服务端使用，不能在客户端导入！             │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么配置优先从 YAML 加载？

1. **集中管理**: 所有 API Key 在一个文件中配置
2. **环境隔离**: 开发/生产环境可使用不同的 YAML 文件
3. **安全**: 敏感配置不入代码库（git ignore）
4. **灵活性**: 支持多租户、多模型配置

### 为什么需要 SSRF 防护？

1. **安全风险**: 用户输入的 URL 可能指向内网
2. **数据泄露**: 防止访问内部服务（如元数据服务）
3. **合规**: 符合安全最佳实践

### 为什么课堂生成使用内存 Store？

1. **隔离性**: 每个生成任务独立的状态
2. **无状态**: 不污染全局 Store
3. **简单**: 无需清理

### 为什么使用任务存储？

1. **异步生成**: 课堂生成可能耗时较长
2. **进度跟踪**: 客户端可轮询进度
3. **可恢复**: 失败后可重试
