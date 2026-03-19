# 数据存储机制

OpenMAIC 采用**纯前端存储架构**，所有用户数据都保存在浏览器的 IndexedDB 中，无需后端数据库服务器。

## 概述

| 项目 | 说明 |
|------|------|
| 存储方式 | IndexedDB（使用 [Dexie.js](https://dexie.org/) 库封装） |
| 数据库名 | `MAIC-Database` |
| 当前版本 | 8 |
| 存储位置 | 浏览器本地 |

### 浏览器存储路径

| 浏览器 | 路径 |
|--------|------|
| Chrome | `~/.config/google-chrome/Default/IndexedDB/` |
| Firefox | `~/.mozilla/firefox/xxxxx/storage/default/` |
| Edge | `~/.config/microsoft-edge/Default/IndexedDB/` |

## 核心文件

| 文件 | 用途 |
|------|------|
| `lib/utils/database.ts` | 数据库定义、表结构、版本迁移 |
| `lib/utils/stage-storage.ts` | 课程数据存取逻辑 |
| `lib/store/` | Zustand 状态管理（与 IndexedDB 同步） |

## 数据库表结构

### stages - 课程基本信息

```typescript
interface StageRecord {
  id: string;           // 主键
  name: string;         // 课程名称
  description?: string; // 课程描述
  createdAt: number;    // 创建时间戳
  updatedAt: number;    // 更新时间戳
  language?: string;    // 语言
  style?: string;       // 风格
  currentSceneId?: string; // 当前场景 ID
}
```

### scenes - 场景/页面数据

```typescript
interface SceneRecord {
  id: string;           // 主键
  stageId: string;      // 外键 -> stages.id
  type: SceneType;      // 场景类型
  title: string;        // 标题
  order: number;        // 显示顺序
  content: SceneContent; // 内容（JSON）
  actions?: Action[];   // 动作列表（JSON）
  whiteboard?: Whiteboard[]; // 白板数据（JSON）
  createdAt: number;
  updatedAt: number;
}
```

### audioFiles - TTS 音频文件

```typescript
interface AudioFileRecord {
  id: string;           // 主键（audioId）
  blob: Blob;           // 音频二进制数据
  duration?: number;    // 时长（秒）
  format: string;       // 格式（mp3, wav 等）
  text?: string;        // 对应文本
  voice?: string;       // 使用的声音
  ossKey?: string;      // CDN URL（可选）
  createdAt: number;
}
```

### imageFiles - 图片文件

```typescript
interface ImageFileRecord {
  id: string;           // 主键
  blob: Blob;           // 图片二进制数据
  filename: string;     // 原始文件名
  mimeType: string;     // MIME 类型
  size: number;         // 文件大小（字节）
  createdAt: number;
}
```

### mediaFiles - AI 生成的媒体文件

```typescript
interface MediaFileRecord {
  id: string;           // 复合主键: `${stageId}:${elementId}`
  stageId: string;      // 外键 -> stages.id
  type: 'image' | 'video';
  blob: Blob;           // 媒体二进制数据
  mimeType: string;     // MIME 类型
  size: number;         // 文件大小
  poster?: Blob;        // 视频缩略图
  prompt: string;       // 原始提示词（用于重试）
  params: string;       // 生成参数（JSON）
  error?: string;       // 错误信息（如有）
  ossKey?: string;      // CDN URL
  posterOssKey?: string; // 缩略图 CDN URL
  createdAt: number;
}
```

### chatSessions - AI 聊天会话

```typescript
interface ChatSessionRecord {
  id: string;           // 主键（会话 ID）
  stageId: string;      // 外键 -> stages.id
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: UIMessage[]; // 消息列表（JSON）
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
  lastActionIndex?: number;
}
```

### playbackState - 播放状态

```typescript
interface PlaybackStateRecord {
  stageId: string;      // 主键
  sceneIndex: number;   // 场景索引
  actionIndex: number;  // 动作索引
  consumedDiscussions: string[];
  updatedAt: number;
}
```

### stageOutlines - 课程大纲

用于断点续传功能，保存生成中的大纲数据。

```typescript
interface StageOutlinesRecord {
  stageId: string;      // 主键
  outlines: SceneOutline[];
  createdAt: number;
  updatedAt: number;
}
```

### generatedAgents - AI 生成的智能体

```typescript
interface GeneratedAgentRecord {
  id: string;           // 主键
  stageId: string;      // 外键 -> stages.id
  name: string;
  role: string;         // 'teacher' | 'assistant' | 'student'
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  createdAt: number;
}
```

### snapshots - 撤销/重做快照

```typescript
interface Snapshot {
  id?: number;
  index: number;
  slides: Scene[];
}
```

## 数据同步机制

OpenMAIC 使用 Zustand 进行状态管理，并通过**防抖保存**机制与 IndexedDB 同步：

1. **状态变更** → Zustand store 更新
2. **防抖 500ms** → 调用 `saveToStorage()`
3. **写入 IndexedDB** → 数据持久化

```typescript
// lib/store/stage.ts
const debouncedSave = debounce(() => {
  useStageStore.getState().saveToStorage();
}, 500);
```

## 数据备份与恢复

```typescript
// 导出数据
const data = await exportDatabase();
// data 包含: stages, scenes, chatSessions, playbackState

// 导入数据
await importDatabase(data);
```

## 重要注意事项

1. **数据与浏览器绑定**：更换浏览器或清除浏览器数据会丢失所有课程
2. **不自动跨设备同步**：数据存储在本地，不会自动同步到其他设备
3. **持久化请求**：代码调用 `navigator.storage.persist()` 防止浏览器在存储压力下自动清理数据
4. **大文件存储**：媒体文件以 Blob 形式存储，大量内容可能占用较多存储空间

## 调试方法

在浏览器中：
1. 按 `F12` 打开开发者工具
2. 切换到 **Application** 标签
3. 左侧找到 **IndexedDB** → **MAIC-Database**
4. 可查看、编辑、删除各表数据
