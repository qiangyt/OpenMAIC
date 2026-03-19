# 国际化模块 (lib/i18n/)

> 多语言翻译和本地化支持

## 概览

本模块实现了应用的多语言支持，目前支持中文（zh-CN）和英文（en-US）。

## 核心文件

| 文件 | 职责 |
|------|------|
| `index.ts` | 翻译函数入口 |
| `types.ts` | 语言类型定义 |
| `common.ts` | 通用翻译 |
| `stage.ts` | 舞台相关翻译 |
| `chat.ts` | 聊天相关翻译 |
| `generation.ts` | 生成相关翻译 |
| `settings.ts` | 设置相关翻译 |

## 使用方式

```typescript
import { translate, getClientTranslation, type Locale } from '@/lib/i18n';

// 服务端：指定语言翻译
const text = translate('zh-CN', 'common.welcome');

// 客户端：自动检测语言
const text = getClientTranslation('common.welcome');
```

## 支持的语言

| 语言代码 | 语言 |
|----------|------|
| `zh-CN` | 简体中文 (默认) |
| `en-US` | 英语 |

## 翻译结构

```typescript
// common.ts
export const commonZhCN = {
  common: {
    welcome: '欢迎',
    save: '保存',
    cancel: '取消',
    // ...
  },
};

export const commonEnUS = {
  common: {
    welcome: 'Welcome',
    save: 'Save',
    cancel: 'Cancel',
    // ...
  },
};
```
