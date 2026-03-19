# 流式缓冲模块 (lib/buffer/)

> SSE 流式数据的缓冲和解析

## 概览

本模块提供了用于处理 SSE（Server-Sent Events）流式数据的缓冲器，支持增量解析和处理。

## 核心文件

| 文件 | 职责 |
|------|------|
| `stream-buffer.ts` | SSE 流缓冲器和解析器 |

## StreamBuffer 类

### 功能

- 增量接收 SSE 数据块
- 解析多种消息类型（文本、动作、思考等）
- 支持增量更新（delta 模式）
- 处理不完整的数据边界

### 支持的消息类型

```typescript
type StreamItem =
  | TextItem       // 文本内容（支持增量追加）
  | ActionItem     // 工具调用动作
  | ThinkingItem   // AI 思考过程
  | CueUserItem    // 提示用户输入
  | DoneItem       // 完成信号
  | ErrorItem;     // 错误信息
```

### 使用方式

```typescript
import { StreamBuffer } from '@/lib/buffer/stream-buffer';

const buffer = new StreamBuffer();

// 接收 SSE 数据块
buffer.append('data: {"kind":"text","text":"Hello","partId":"1"}\n\n');
buffer.append('data: {"kind":"text","text":" World","partId":"1"}\n\n');

// 获取解析后的消息
const messages = buffer.flush();
// [
//   { kind: 'text', messageId: '...', partId: '1', text: 'Hello World', sealed: false }
// ]

// 处理完成
buffer.append('data: {"kind":"done","totalActions":5}\n\n');
const finalMessages = buffer.flush();
// 最后一条消息包含 sealed: true
```

### 增量文本处理

```typescript
// StreamBuffer 会自动合并同一 partId 的增量文本
buffer.append('data: {"kind":"text","text":"Hel","partId":"p1"}\n\n');
buffer.append('data: {"kind":"text","text":"lo","partId":"p1"}\n\n');
buffer.append('data: {"kind":"text","text":" World","partId":"p1","sealed":true}\n\n');

const messages = buffer.flush();
// [{ kind: 'text', text: 'Hello World', partId: 'p1', sealed: true }]
```

### SSE 消息格式

```typescript
// 文本消息
{ "kind": "text", "messageId": "...", "partId": "...", "text": "...", "sealed": false }

// 动作消息
{ "kind": "action", "actionName": "...", "params": {...} }

// 思考消息
{ "kind": "thinking", "stage": "analyzing" }

// 完成消息
{ "kind": "done", "totalActions": 10 }

// 错误消息
{ "kind": "error", "message": "..." }
```

## 与其他模块的关系

```
lib/buffer/
    │
    ├── 依赖: 无外部依赖
    │
    └── 被依赖: lib/orchestration/* (多智能体编排)
               components/chat/* (聊天组件)
               app/api/generate/* (生成 API)
```

## 设计决策

### 为什么需要缓冲器？

1. **网络分片**: TCP 数据可能被分割
2. **消息边界**: SSE 消息可能跨多个数据块
3. **增量合并**: 相同 partId 的文本需要合并

### 为什么使用 flush 而非事件？

1. **控制权**: 调用者决定何时处理消息
2. **批量处理**: 减少 UI 更新次数
3. **简单**: 无需管理事件监听器
