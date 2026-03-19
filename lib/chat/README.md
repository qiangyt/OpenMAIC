# 聊天工具模块 (lib/chat/)

> 聊天消息和动作显示工具

## 概览

本模块提供聊天相关的工具函数，用于消息解析、状态显示等。

## 核心文件

| 文件 | 职责 |
|------|------|
| `action-translations.ts` | 动作名称翻译和状态徽章 |

## 功能

### 动作名称翻译

```typescript
import { getActionDisplayName } from '@/lib/chat/action-translations';
import { useI18n } from '@/lib/hooks/use-i18n';

const { t } = useI18n();
const displayName = getActionDisplayName(t, 'change_slide');
// 返回: "切换幻灯片" (或翻译后的名称)
```

### 状态徽章

```typescript
import { getStatusBadge } from '@/lib/chat/action-translations';
import { useI18n } from '@/lib/hooks/use-i18n';

const { t } = useI18n();

// 获取状态徽章组件
const badge = getStatusBadge(t, 'running');
// 返回带图标的徽章 ReactNode
// <Badge><ClockIcon className="animate-pulse" />正在执行</Badge>

// 支持的状态
// - input-streaming: 输入流中
// - input-available: 等待处理
// - running: 正在执行
// - output-available / result: 完成
// - output-error / error: 错误
// - output-denied: 被拒绝
```

### 消息部分提取

```typescript
import {
  getMessageTextParts,
  getMessageActionParts,
} from '@/lib/chat/action-translations';

// 提取消息中的文本部分
const textParts = getMessageTextParts(message);
// [{ type: 'text', text: 'Hello' }, { type: 'step-start' }, ...]

// 提取消息中的动作部分
const actionParts = getMessageActionParts(message);
// [{ type: 'action-call', ... }, { type: 'action-result', ... }, ...]
```

## 状态映射

| 状态 | 图标 | 颜色 |
|------|------|------|
| input-streaming | Circle | 默认 |
| input-available | Clock | 默认 |
| running | Clock (动画) | 默认 |
| output-available | CheckCircle | 绿色 |
| result | CheckCircle | 绿色 |
| output-error | XCircle | 红色 |
| error | XCircle | 红色 |
| output-denied | XCircle | 橙色 |

## 与其他模块的关系

```
lib/chat/
    │
    ├── 依赖: components/ui/badge.tsx
    │         lucide-react (图标)
    │         lib/hooks/use-i18n.tsx (翻译)
    │
    └── 被依赖: components/chat/* (聊天组件)
```
