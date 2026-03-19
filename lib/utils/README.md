# 工具模块 (lib/utils/)

> 通用工具函数和本地存储管理

## 概览

本模块提供了一系列通用工具函数，包括 IndexedDB 数据库管理、元素几何计算、音频播放、事件发射器等。

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/utils/                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   数据存储                               │   │
│  │  - database.ts      IndexedDB 数据库定义                 │   │
│  │  - stage-storage.ts 课件数据管理                         │   │
│  │  - chat-storage.ts  聊天会话存储                         │   │
│  │  - image-storage.ts 图片文件存储                         │   │
│  │  - playback-storage.ts 播放状态存储                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   几何计算                               │   │
│  │  - element.ts       元素位置/范围计算                    │   │
│  │  - geometry.ts      通用几何工具                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   通用工具                               │   │
│  │  - audio-player.ts  音频播放器                           │   │
│  │  - emitter.ts       事件发射器                           │   │
│  │  - cn.ts            CSS 类名合并                         │   │
│  │  - create-selectors.ts Zustand 选择器                    │   │
│  │  - element-fingerprint.ts 元素指纹                       │   │
│  │  - model-config.ts  模型配置                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `database.ts` | IndexedDB 数据库定义和操作 |
| `stage-storage.ts` | 课件数据的 CRUD 操作 |
| `chat-storage.ts` | 聊天会话持久化 |
| `image-storage.ts` | 图片文件存储 |
| `playback-storage.ts` | 播放状态快照 |
| `element.ts` | 元素几何计算 |
| `geometry.ts` | 通用几何工具 |
| `audio-player.ts` | TTS 音频播放器 |
| `emitter.ts` | 全局事件发射器 |
| `cn.ts` | Tailwind CSS 类名合并 |
| `create-selectors.ts` | Zustand 选择器工厂 |
| `element-fingerprint.ts` | 元素变更检测 |

## IndexedDB 数据库 (database.ts)

### 数据库表结构

```typescript
// 数据库版本: 8
// 数据库名: 'MAIC-Database'

class MAICDatabase extends Dexie {
  // 课件表
  stages!: EntityTable<StageRecord, 'id'>;
  // 场景表
  scenes!: EntityTable<SceneRecord, 'id'>;
  // TTS 音频文件表
  audioFiles!: EntityTable<AudioFileRecord, 'id'>;
  // 图片文件表
  imageFiles!: EntityTable<ImageFileRecord, 'id'>;
  // 撤销/重做快照表 (历史遗留)
  snapshots!: EntityTable<Snapshot, 'id'>;
  // 聊天会话表
  chatSessions!: EntityTable<ChatSessionRecord, 'id'>;
  // 播放状态表
  playbackState!: EntityTable<PlaybackStateRecord, 'stageId'>;
  // 场景大纲表 (断点续传)
  stageOutlines!: EntityTable<StageOutlinesRecord, 'stageId'>;
  // AI 生成媒体表
  mediaFiles!: EntityTable<MediaFileRecord, 'id'>;
  // AI 生成智能体表
  generatedAgents!: EntityTable<GeneratedAgentRecord, 'id'>;
}
```

### 数据记录类型

```typescript
// 课件记录
interface StageRecord {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  language?: string;
  style?: string;
  currentSceneId?: string;
}

// 场景记录
interface SceneRecord {
  id: string;
  stageId: string;
  type: SceneType;
  title: string;
  order: number;
  content: SceneContent;
  actions?: Action[];
  whiteboard?: Whiteboard[];
  createdAt: number;
  updatedAt: number;
}

// 音频文件记录
interface AudioFileRecord {
  id: string;
  blob: Blob;
  duration?: number;
  format: string;
  text?: string;
  voice?: string;
  createdAt: number;
  ossKey?: string;
}

// 媒体文件记录
interface MediaFileRecord {
  id: string;          // 格式: `${stageId}:${elementId}`
  stageId: string;
  type: 'image' | 'video';
  blob: Blob;
  mimeType: string;
  size: number;
  poster?: Blob;
  prompt: string;
  params: string;
  error?: string;
  errorCode?: string;
  ossKey?: string;
  posterOssKey?: string;
  createdAt: number;
}

// 生成媒体复合键
function mediaFileKey(stageId: string, elementId: string): string {
  return `${stageId}:${elementId}`;
}
```

### 数据库操作

```typescript
import { db, initDatabase, clearDatabase } from '@/lib/utils/database';

// 初始化数据库（应用启动时调用）
await initDatabase();

// 清空数据库（危险操作）
await clearDatabase();

// 获取数据库统计
const stats = await getDatabaseStats();
// { stages, scenes, audioFiles, imageFiles, snapshots, chatSessions, ... }

// 导出/导入数据（备份）
const data = await exportDatabase();
await importDatabase(data);

// 删除课件及关联数据
await deleteStageWithRelatedData(stageId);

// 按课件 ID 获取场景
const scenes = await getScenesByStageId(stageId);
```

## 课件存储管理 (stage-storage.ts)

```typescript
import {
  saveStageData,
  loadStageData,
  deleteStageData,
  listStages,
  stageExists,
  getFirstSlideByStages,
} from '@/lib/utils/stage-storage';

// 保存课件数据
await saveStageData(stageId, {
  stage: { name: '新课件', ... },
  scenes: [scene1, scene2, ...],
  currentSceneId: 'scene_1',
  chats: [chat1, chat2, ...],
});

// 加载课件数据
const data = await loadStageData(stageId);
// { stage, scenes, currentSceneId, chats }

// 删除课件
await deleteStageData(stageId);

// 列出所有课件
const stages = await listStages();
// [{ id, name, description, sceneCount, createdAt, updatedAt }, ...]

// 检查课件是否存在
const exists = await stageExists(stageId);

// 获取各课件的首张幻灯片（用于缩略图预览）
const thumbnails = await getFirstSlideByStages([stageId1, stageId2]);
// { [stageId]: Slide }
```

## 音频播放器 (audio-player.ts)

```typescript
import { createAudioPlayer, AudioPlayer } from '@/lib/utils/audio-player';

const player = createAudioPlayer();

// 播放音频（优先服务器 URL，回退到 IndexedDB）
await player.play('audio_1', 'https://cdn.example.com/audio.mp3');

// 播放控制
player.pause();
player.resume();
player.stop();

// 状态查询
player.isPlaying();    // 是否正在播放
player.hasActiveAudio(); // 是否有活动音频（播放或暂停）
player.getCurrentTime(); // 当前播放时间（毫秒）
player.getDuration();    // 音频时长（毫秒）

// 设置回调
player.onEnded(() => {
  console.log('播放结束');
});

// 音量控制
player.setMuted(true);
player.setVolume(0.5);     // 0-1
player.setPlaybackRate(1.5); // 0.5-2

// 销毁
player.destroy();
```

### 音频播放流程

```
play(audioId, audioUrl?)
       │
       ├─ audioUrl 存在?
       │   ├─ YES → 直接使用 URL
       │   │
       │   └─ NO → 从 IndexedDB 加载
       │       └─ db.audioFiles.get(audioId)
       │           ├─ 找到 → 创建 Blob URL
       │           └─ 未找到 → 返回 false
       │
       ▼
   创建 HTMLAudioElement
       │
       ▼
   audio.play()
       │
       ▼
   ended 事件触发 onEndedCallback
```

## 元素几何计算 (element.ts)

```typescript
import {
  getRectRotatedRange,
  getRectRotatedOffset,
  getElementRange,
  getElementListRange,
  getLineElementLength,
  uniqAlignLines,
  createSlideIdMap,
  createElementIdMap,
  getTableSubThemeColor,
  getLineElementPath,
  isElementInViewport,
} from '@/lib/utils/element';

// 计算旋转后的边界范围
const { xRange, yRange } = getRectRotatedRange({
  left: 100,
  top: 100,
  width: 200,
  height: 100,
  rotate: 45,
});
// xRange: [minX, maxX], yRange: [minY, maxY]

// 获取单个元素的范围
const { minX, maxX, minY, maxY } = getElementRange(element);

// 获取一组元素的范围
const range = getElementListRange([el1, el2, el3]);

// 计算线条长度
const length = getLineElementLength(lineElement);

// 对齐线去重
const uniqueLines = uniqAlignLines(alignLines);

// 创建 ID 映射（用于复制/粘贴）
const slideIdMap = createSlideIdMap(slides);
const { groupIdMap, elIdMap } = createElementIdMap(elements);

// 获取表格子主题色
const [color1, color2] = getTableSubThemeColor('#4F46E5');

// 获取线条 SVG 路径
const path = getLineElementPath(lineElement);
// "M0,0 L100,100" 或 "M0,0 Q50,0 100,100" 等

// 检查元素是否在视口内
const isVisible = isElementInViewport(element, container);
```

## 事件发射器 (emitter.ts)

```typescript
import emitter, { EmitterEvents } from '@/lib/utils/emitter';

// 发送事件
emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, {
  target: 'element_1',
  action: { command: 'bold', value: 'true' },
});

emitter.emit(EmitterEvents.OPEN_CHART_DATA_EDITOR);

// 监听事件
emitter.on(EmitterEvents.RICH_TEXT_COMMAND, (data) => {
  console.log('富文本命令:', data);
});

// 取消监听
emitter.off(EmitterEvents.RICH_TEXT_COMMAND, handler);
```

### 可用事件

| 事件 | 用途 |
|------|------|
| `RICH_TEXT_COMMAND` | 富文本编辑命令 |
| `SYNC_RICH_TEXT_ATTRS_TO_STORE` | 同步富文本属性到 Store |
| `OPEN_CHART_DATA_EDITOR` | 打开图表数据编辑器 |
| `OPEN_LATEX_EDITOR` | 打开 LaTeX 编辑器 |

## CSS 类名合并 (cn.ts)

```typescript
import { cn } from '@/lib/utils';

// 合并 Tailwind 类名（自动处理冲突）
cn('px-4 py-2', 'px-6');           // "py-2 px-6"
cn('text-red-500', isActive && 'text-blue-500');  // 条件类名
cn('base-class', { 'active': isActive });  // 对象语法
```

## Zustand 选择器工厂 (create-selectors.ts)

```typescript
import { createSelectors } from '@/lib/utils/create-selectors';

// 创建带选择器的 store
const useStore = createSelectors(create<StoreState>((set) => ({
  count: 0,
  name: 'test',
  increment: () => set((s) => ({ count: s.count + 1 })),
})));

// 使用优化后的选择器（避免不必要的重渲染）
const count = useStore.use.count();      // 仅订阅 count
const name = useStore.use.name();        // 仅订阅 name
```

## 元素指纹 (element-fingerprint.ts)

```typescript
import { elementFingerprint } from '@/lib/utils/element-fingerprint';

// 生成元素列表的指纹（用于变更检测）
const fingerprint = elementFingerprint(elements);
// JSON 字符串，包含 id、位置、语义内容

// 用于历史记录去重
if (elementFingerprint(newElements) !== elementFingerprint(oldElements)) {
  // 内容有变化，保存快照
}
```

### 语义内容提取

```typescript
// 不同元素类型提取不同的语义内容
// - text: { content }
// - image: { src }
// - shape: { path, fill, text, gradient, pattern }
// - chart: { chartType, data, themeColors }
// - table: { data, colWidths, theme }
// - latex: { latex }
// - video: { src, poster }
// - audio: { src }
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/utils/                               │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - dexie (IndexedDB ORM)                                       │
│  - zustand (状态管理)                                          │
│  - clsx, tailwind-merge (CSS 合并)                             │
│  - mitt (事件发射器)                                           │
│  - tinycolor2 (颜色处理)                                       │
│  - nanoid (ID 生成)                                            │
│  - lib/types/* (类型定义)                                      │
│                                                                 │
│  被依赖:                                                        │
│  - lib/store/* (状态持久化)                                    │
│  - lib/playback/* (播放状态)                                   │
│  - lib/generation/* (大纲缓存)                                 │
│  - lib/media/* (媒体文件存储)                                  │
│  - components/* (通用工具)                                     │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用 Dexie 而非原生 IndexedDB？

1. **类型安全**: TypeScript 完整支持
2. **API 友好**: Promise 链式调用
3. **事务支持**: 简化复杂操作
4. **版本迁移**: 内置 schema 迁移机制

### 为什么媒体文件使用复合主键？

1. **全局唯一**: `${stageId}:${elementId}` 避免跨课件冲突
2. **关联查询**: 可按 stageId 查询该课件所有媒体
3. **原子操作**: 单条记录包含所有关联信息

### 为什么音频播放器优先使用服务器 URL？

1. **新鲜度**: 服务器生成的音频可能更新
2. **性能**: 避免 IndexedDB 读取开销
3. **灵活性**: 支持动态生成的 URL

### 为什么使用元素指纹而非直接比较？

1. **深度比较性能差**: JSON.stringify 更快
2. **语义关注**: 只关注影响渲染的内容
3. **去重友好**: 字符串可直接用于 Set/Map
