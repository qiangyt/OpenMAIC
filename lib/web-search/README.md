# 网络搜索模块 (lib/web-search/)

> 网络搜索服务集成

## 概览

本模块提供网络搜索能力，用于在课件生成时获取实时信息。

## 核心文件

| 文件 | 职责 |
|------|------|
| `tavily.ts` | Tavily 搜索 API 集成 |
| `types.ts` | 搜索结果类型定义 |
| `constants.ts` | 搜索相关常量 |

## 使用方式

```typescript
import {
  searchWithTavily,
  formatSearchResultsAsContext,
} from '@/lib/web-search/tavily';

// 执行搜索
const result = await searchWithTavily({
  query: '光合作用的过程',
  apiKey: 'tvly-xxx',
  maxResults: 5,
});

// result = {
//   answer: 'AI 生成的答案摘要',
//   sources: [{ title, url, content, score }, ...],
//   query: '光合作用的过程',
//   responseTime: 1200,
// }

// 格式化为 LLM 上下文
const context = formatSearchResultsAsContext(result);
// 返回 Markdown 格式的上下文，可直接插入提示词
```

## 类型定义

```typescript
interface WebSearchSource {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface WebSearchResult {
  answer: string;           // AI 生成的答案
  sources: WebSearchSource[];
  query: string;
  responseTime: number;
}
```

## 与其他模块的关系

```
lib/web-search/
    │
    ├── 依赖: lib/server/proxy-fetch.ts (代理请求)
    │
    └── 被依赖: lib/server/classroom-generation.ts (课堂生成)
               lib/generation/* (大纲生成)
```
