# 存储抽象模块 (lib/storage/)

> 云存储服务的抽象层

## 概览

本模块提供云存储服务的统一抽象，支持将媒体文件上传到云存储（如 OSS、S3 等）。

## 核心文件

| 文件 | 职责 |
|------|------|
| `types.ts` | 存储提供者接口定义 |
| `index.ts` | 模块入口 |
| `providers/` | 各云存储实现 |

## 存储提供者接口

```typescript
// types.ts
export type StorageType = 'media' | 'poster' | 'audio';

export interface StorageProvider {
  /** 上传 Blob 到存储。返回公开 URL。已存在则跳过（去重）。 */
  upload(hash: string, blob: Buffer, type: StorageType, mimeType?: string): Promise<string>;

  /** 检查 key 是否已存在 */
  exists(hash: string, type: StorageType): Promise<boolean>;

  /** 构建公开下载 URL */
  getUrl(hash: string, type: StorageType): string;

  /** 批量检查哪些 hash 已存在 */
  batchExists(hashes: string[], type: StorageType): Promise<Set<string>>;
}
```

## 使用方式

```typescript
import { getStorageProvider } from '@/lib/storage';

// 获取存储提供者（根据配置）
const storage = getStorageProvider();

// 上传文件（使用 hash 去重）
const hash = computeHash(blob);
const url = await storage.upload(hash, blob, 'media', 'image/png');
// 返回: "https://cdn.example.com/media/abc123.png"

// 检查是否已存在
if (await storage.exists(hash, 'media')) {
  console.log('文件已存在，跳过上传');
}

// 批量检查
const existingHashes = await storage.batchExists([hash1, hash2, hash3], 'media');
```

## 存储类型

| 类型 | 用途 | 路径前缀 |
|------|------|---------|
| `media` | AI 生成的图片/视频 | `/media/` |
| `poster` | 视频封面图 | `/poster/` |
| `audio` | TTS 音频文件 | `/audio/` |

## 设计决策

### 为什么使用 hash 作为文件名？

1. **去重**: 相同内容只存储一份
2. **安全**: 不暴露原始文件名
3. **缓存友好**: URL 永久有效

### 为什么需要批量检查？

1. **性能**: 减少 API 调用次数
2. **同步**: 在课堂生成时批量检查已存在媒体
