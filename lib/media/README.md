# 媒体生成模块 (lib/media/)

> AI 图片和视频生成的统一抽象层

## 概览

本模块实现了 AI 媒体生成的统一调用接口，支持多种图片和视频生成提供商。

```
┌─────────────────────────────────────────────────────────────────┐
│                    Media Orchestrator                           │
│  ────────────────────────────────────────────────────────────  │
│  前端运行，调用 API、获取结果、存储到 IndexedDB                  │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ /api/generate│  │ /api/generate│  │  /api/proxy  │
    │   /image     │  │   /video     │  │    -media    │
    └──────┬───────┘  └──────┬───────┘  └──────────────┘
           │                 │
           ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Provider Adapters                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Seedream   │  │  Qwen Image  │  │ Nano Banana  │  图片    │
│  │   (豆包)     │  │  (通义万相)   │  │   (Gemini)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Seedance   │  │    Kling     │  │     Veo      │  视频    │
│  │   (豆包)     │  │   (可灵)     │  │  (Google)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `media-orchestrator.ts` | 媒体生成编排器（前端运行） |
| `image-providers.ts` | 图片生成提供者注册和路由 |
| `video-providers.ts` | 视频生成提供者注册和路由 |
| `types.ts` | 类型定义 |
| `adapters/*.ts` | 各厂商 API 适配器 |

## 图片生成提供者

### 支持的提供者

| Provider ID | 名称 | 模型 |
|-------------|------|------|
| `seedream` | Seedream (豆包) | Seedream 5.0, 4.5, 4.0, 3.0 |
| `qwen-image` | Qwen Image (通义万相) | qwen-image-max, qwen-image-plus |
| `nano-banana` | Nano Banana (Gemini) | gemini-3.1-flash-image, gemini-2.5-flash-image |

### 配置结构

```typescript
interface ImageProviderConfig {
  id: ImageProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string;
  models: Array<{ id: string; name: string }>;
  supportedAspectRatios: string[];  // ['16:9', '4:3', '1:1', '9:16']
}
```

### 使用方式

```typescript
import { generateImage, IMAGE_PROVIDERS } from '@/lib/media/image-providers';

const result = await generateImage(
  {
    providerId: 'seedream',
    apiKey: 'xxx',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    modelId: 'doubao-seedream-5-0-260128',
  },
  {
    prompt: '一张展示光合作用过程的科学插图',
    aspectRatio: '16:9',
    style: 'scientific',
  }
);

// result = { success: true, url: 'https://...' } 或 { success: false, error: '...' }
```

## 视频生成提供者

### 支持的提供者

| Provider ID | 名称 | 模型 | 最大时长 |
|-------------|------|------|---------|
| `seedance` | Seedance (豆包) | Seedance 1.5 Pro, 1.0 Pro | 10s |
| `kling` | Kling (可灵) | Kling V2.6, V1.6 | 10s |
| `veo` | Veo (Google) | Veo 3.1, 3.0, 2.0 | 8s |
| `sora` | Sora (OpenAI) | (预留) | 20s |

### 配置结构

```typescript
interface VideoProviderConfig {
  id: VideoProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string;
  models: Array<{ id: string; name: string }>;
  supportedAspectRatios: string[];
  supportedDurations: number[];      // [5, 10]
  supportedResolutions?: string[];   // ['480p', '720p', '1080p']
  maxDuration: number;               // 秒
}
```

### 选项规范化

```typescript
// normalizeVideoOptions 确保选项符合提供者能力
const normalized = normalizeVideoOptions('seedance', {
  duration: 15,        // 超出最大值，规范化为 10
  aspectRatio: '21:9', // 支持
  resolution: '4K',    // 不支持，回退到第一个支持的 '480p'
});
```

## Media Orchestrator

### 核心流程

```typescript
// 1. 从大纲中收集所有媒体生成请求
export async function generateMediaForOutlines(
  outlines: SceneOutline[],
  stageId: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  // 收集请求
  const allRequests: MediaGenerationRequest[] = [];
  for (const outline of outlines) {
    if (outline.mediaGenerations) {
      allRequests.push(...outline.mediaGenerations);
    }
  }

  // 入队为 pending 状态
  useMediaGenerationStore.getState().enqueueTasks(stageId, allRequests);

  // 串行处理（图片/视频 API 并发有限）
  for (const req of allRequests) {
    await generateSingleMedia(req, stageId, abortSignal);
  }
}

// 2. 单个媒体生成
async function generateSingleMedia(req, stageId, signal) {
  // 标记为 generating
  store.markGenerating(req.elementId);

  // 调用 API
  const result = req.type === 'image'
    ? await callImageApi(req, signal)
    : await callVideoApi(req, signal);

  // 获取 Blob
  const blob = await fetchAsBlob(result.url);

  // 存储到 IndexedDB
  await db.mediaFiles.put({
    id: mediaFileKey(stageId, req.elementId),
    blob,
    mimeType,
    ...
  });

  // 更新 store 状态
  store.markDone(req.elementId, objectUrl);
}
```

### 重试机制

```typescript
export async function retryMediaTask(elementId: string): Promise<void> {
  const task = store.getTask(elementId);
  if (!task || task.status !== 'failed') return;

  // 删除 IndexedDB 中的失败记录
  await db.mediaFiles.delete(mediaFileKey(task.stageId, elementId));

  // 标记为待重试
  store.markPendingForRetry(elementId);

  // 重新生成
  await generateSingleMedia({ ... }, task.stageId);
}
```

### 错误处理

```typescript
class MediaApiError extends Error {
  errorCode?: string;  // 结构化错误码
}

// 错误码示例
// - 'CONTENT_SENSITIVE': 内容敏感
// - 'GENERATION_DISABLED': 生成功能已禁用
// - 'QUOTA_EXCEEDED': 配额超限

// 非重试性错误持久化到 IndexedDB
if (errorCode) {
  await db.mediaFiles.put({
    ...
    error: message,
    errorCode,  // 下次恢复时显示为失败状态
  });
}
```

## 适配器实现

### 适配器接口

```typescript
interface MediaAdapter {
  // 测试连接性
  testConnectivity(config: MediaConfig): Promise<{ success: boolean; message: string }>;

  // 生成媒体
  generate(config: MediaConfig, options: MediaOptions): Promise<MediaResult>;
}

interface MediaResult {
  success: boolean;
  url?: string;       // 结果 URL
  base64?: string;    // 或 base64 数据
  poster?: string;    // 视频封面（可选）
  error?: string;
  errorCode?: string;
}
```

### 添加新提供者

1. **在 `types.ts` 添加类型**
   ```typescript
   type ImageProviderId = ... | 'new-provider';
   ```

2. **在 `*-providers.ts` 添加配置**
   ```typescript
   export const IMAGE_PROVIDERS = {
     ...
     'new-provider': {
       id: 'new-provider',
       name: 'New Provider',
       requiresApiKey: true,
       defaultBaseUrl: 'https://api.example.com',
       models: [{ id: 'model-1', name: 'Model 1' }],
       supportedAspectRatios: ['16:9', '1:1'],
     },
   };
   ```

3. **实现适配器** (`adapters/new-provider-adapter.ts`)
   ```typescript
   export async function generateWithNewProvider(config, options) {
     const response = await fetch(`${baseUrl}/generate`, {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${config.apiKey}` },
       body: JSON.stringify({ prompt: options.prompt, ... }),
     });
     // 处理响应...
   }
   ```

4. **在 providers.ts 添加路由**
   ```typescript
   switch (config.providerId) {
     case 'new-provider':
       return generateWithNewProvider(config, options);
   }
   ```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/media/                               │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/store/settings.ts (提供者配置)                           │
│  - lib/store/media-generation.ts (任务状态)                     │
│  - lib/utils/database.ts (IndexedDB 存储)                       │
│  - lib/types/generation.ts (MediaGenerationRequest)            │
│                                                                 │
│  被依赖:                                                        │
│  - app/api/generate/image/route.ts                             │
│  - app/api/generate/video/route.ts                             │
│  - lib/generation/ (课程生成时调用)                             │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么串行处理请求？

1. **API 限制**: 图片/视频 API 通常有并发限制
2. **资源控制**: 避免同时占用大量带宽和内存
3. **状态管理**: 简化任务状态追踪

### 为什么使用 IndexedDB 而非内存？

1. **持久化**: 页面刷新后数据不丢失
2. **大文件**: 图片/视频 Blob 可能很大
3. **离线访问**: 缓存生成结果

### 为什么通过 /api/proxy-media 代理？

1. **CORS 绕过**: 部分提供者返回的 URL 不支持跨域
2. **统一缓存**: 服务端可以缓存结果
3. **安全性**: 不暴露客户端 IP
