# 常量模块 (lib/constants/)

> 应用全局常量定义

## 概览

本模块定义了应用中使用的全局常量，确保常量在客户端和服务端之间共享。

## 核心文件

| 文件 | 职责 |
|------|------|
| `generation.ts` | 内容生成相关常量 |

## 生成常量 (generation.ts)

```typescript
// PDF 内容截断限制（字符数）
export const MAX_PDF_CONTENT_CHARS = 50000;

// Vision API 最大图片数量
export const MAX_VISION_IMAGES = 20;
```

### 用途

| 常量 | 用途 |
|------|------|
| `MAX_PDF_CONTENT_CHARS` | 限制发送给 LLM 的 PDF 文本长度，避免 token 超限 |
| `MAX_VISION_IMAGES` | 限制同时发送的图片数量，避免请求过大 |

## 设计决策

### 为什么使用独立模块？

1. **共享访问**: 客户端和服务端都需要访问
2. **集中管理**: 所有常量集中定义，便于维护
3. **类型安全**: TypeScript 类型检查
