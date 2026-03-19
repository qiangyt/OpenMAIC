# 状态管理模块 (lib/store/)

> 基于 Zustand 的全局状态管理，支持持久化、选择器和派生状态

## 概览

本模块使用 Zustand 实现全局状态管理，主要特性：

1. **多 Store 架构**: 按功能域分离 Store（stage、canvas、settings 等）
2. **持久化**: localStorage 和 IndexedDB 双层持久化
3. **选择器模式**: 支持 `store.use.xxx()` 细粒度订阅
4. **版本迁移**: 支持数据结构升级时的自动迁移

```
┌─────────────────────────────────────────────────────────────────┐
│                     Store 架构                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  StageStore  │  │ CanvasStore  │  │ SettingsStore│          │
│  │              │  │              │  │              │          │
│  │ - stage      │  │ - selection  │  │ - providerId │          │
│  │ - scenes     │  │ - viewport   │  │ - modelId    │          │
│  │ - chats      │  │ - effects    │  │ - agents     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                   持久化层                             │      │
│  │  ┌─────────────┐         ┌──────────────┐            │      │
│  │  │ localStorage│         │  IndexedDB   │            │      │
│  │  │ (zustand)   │         │  (自定义)    │            │      │
│  │  └─────────────┘         └──────────────┘            │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `stage.ts` | 舞台状态 - stage、scenes、chats、生成状态 |
| `canvas.ts` | 画布状态 - 选择、视口、视觉效果 |
| `settings.ts` | 设置状态 - 模型、提供者、音频、布局 |
| `media-generation.ts` | 媒体生成状态 - 图片/视频生成任务跟踪 |
| `whiteboard-history.ts` | 白板历史 - 撤销/重做栈 |
| `user-profile.ts` | 用户配置 - 昵称、简介 |
| `keyboard.ts` | 键盘状态 - 快捷键状态 |
| `snapshot.ts` | 快照状态 - 场景快照管理 |
| `index.ts` | 导出所有 Store |

## StageStore (stage.ts)

### 状态结构

```typescript
interface StageState {
  // ===== 核心数据 =====
  stage: Stage | null;              // 当前舞台
  scenes: Scene[];                  // 场景列表
  currentSceneId: string | null;    // 当前场景 ID
  mode: StageMode;                  // 'autonomous' | 'playback'

  // ===== 生成状态 =====
  generatingOutlines: boolean;      // 正在生成大纲
  outlines: SceneOutline[];         // 已生成的大纲
  generationStatus: GenerationStatus; // 生成状态
  failedOutlines: string[];         // 失败的大纲 ID

  // ===== 聊天状态 =====
  chats: ChatSession[];             // 聊天会话列表
  currentChatId: string | null;     // 当前会话 ID

  // ===== 派生状态 =====
  currentScene: Scene | undefined;  // 只读 getter
  currentChat: ChatSession | undefined; // 只读 getter
  orderedScenes: Scene[];           // 按 order 排序的场景

  // ===== Actions =====
  setStage: (stage: Stage | null) => void;
  setScenes: (scenes: Scene[]) => void;
  addScene: (scene: Scene) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  setCurrentSceneId: (id: string | null) => void;
  setMode: (mode: StageMode) => void;
  // ...
}
```

### IndexedDB 持久化

```typescript
// 保存到 IndexedDB
const saveToStorage = debounce(async (state: StageState) => {
  if (!state.stage) return;

  const db = await openDB('openmaic');
  await db.put('stages', {
    id: state.stage.id,
    stage: state.stage,
    scenes: state.scenes,
    currentSceneId: state.currentSceneId,
    mode: state.mode,
    updatedAt: Date.now(),
  });
}, 500);

// 从 IndexedDB 恢复
const loadFromStorage = async (stageId: string) => {
  const db = await openDB('openmaic');
  const record = await db.get('stages', stageId);
  if (record) {
    set({
      stage: record.stage,
      scenes: record.scenes,
      currentSceneId: record.currentSceneId,
      mode: record.mode,
    });
  }
};
```

## CanvasStore (canvas.ts)

### 状态结构

```typescript
interface CanvasState {
  // ===== 元素选择 =====
  activeElementIdList: string[];    // 选中的元素 IDs
  handleElementId: string;          // 正在操作的元素
  activeGroupElementId: string;     // 组内选中的子元素
  editingElementId: string;         // 正在编辑的元素（文本编辑）
  hiddenElementIdList: string[];    // 隐藏的元素

  // ===== 教学效果 =====
  spotlightElementId: string;       // 聚光灯目标
  spotlightOptions: SpotlightOptions | null;
  laserElementId: string;           // 激光笔目标
  laserOptions: LaserOptions | null;
  highlightedElementIds: string[];  // 高亮元素
  zoomTarget: { elementId: string; scale: number } | null;

  // ===== 视口状态 =====
  canvasScale: number;              // 缩放比例
  canvasPercentage: number;         // 百分比（用于计算 scale）
  viewportSize: number;             // 视口基准宽度 (默认 1000px)
  viewportRatio: number;            // 视口宽高比 (默认 0.5625 即 16:9)
  canvasDragged: boolean;           // 画布是否被拖拽

  // ===== 辅助显示 =====
  showRuler: boolean;               // 显示标尺
  gridLineSize: number;             // 网格大小（0 为隐藏）

  // ===== 工具栏和面板 =====
  toolbarState: 'design' | 'ai' | 'elAnimation';
  showSelectPanel: boolean;
  showSearchPanel: boolean;

  // ===== 元素创建 =====
  creatingElement: CreatingElement | null;
  creatingCustomShape: boolean;

  // ===== 编辑状态 =====
  isScaling: boolean;
  clipingImageElementId: string;
  richTextAttrs: TextAttrs;

  // ===== 白板 =====
  whiteboardOpen: boolean;
  whiteboardClearing: boolean;

  // ===== 视频播放 =====
  playingVideoElementId: string;

  // ===== Actions =====
  setActiveElementIdList: (ids: string[]) => void;
  clearSelection: () => void;
  setSpotlight: (elementId: string, options?: SpotlightOptions) => void;
  clearAllEffects: () => void;
  // ...
}
```

### 教学效果控制

```typescript
// 聚光灯效果
setSpotlight: (elementId, options = {}) => {
  set({
    spotlightElementId: elementId,
    spotlightMode: 'pixel',
    spotlightOptions: {
      radius: 200,
      dimness: 0.7,
      transition: 300,
      ...options,
    },
  });
},

// 激光笔效果
setLaser: (elementId, options = {}) => {
  set({
    laserElementId: elementId,
    laserOptions: {
      color: '#ff0000',
      duration: 3000,
      ...options,
    },
  });
},

// 清除所有视觉效果（注意：不清除视频播放状态）
clearAllEffects: () => {
  set({
    spotlightElementId: '',
    spotlightOptions: null,
    highlightedElementIds: [],
    laserElementId: '',
    laserOptions: null,
    zoomTarget: null,
    // Note: playingVideoElementId 故意不清除
    // 视频播放有独立的生命周期管理
  });
},
```

### 选择器模式

```typescript
// 使用 createSelectors 增强 Store
const useCanvasStoreBase = create<CanvasState>((set, get) => ({ ... }));
export const useCanvasStore = createSelectors(useCanvasStoreBase);

// 使用方式 - 细粒度订阅，避免不必要的重渲染
function MyComponent() {
  // ✅ 只订阅 canvasScale 变化
  const scale = useCanvasStore.use.canvasScale();

  // ❌ 订阅整个 Store，任何变化都会重渲染
  const { canvasScale } = useCanvasStore();
}
```

## SettingsStore (settings.ts)

### 状态结构

```typescript
interface SettingsState {
  // ===== 模型选择 =====
  providerId: ProviderId;
  modelId: string;
  providersConfig: ProvidersConfig;

  // ===== TTS 设置 =====
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed: number;
  ttsEnabled: boolean;
  ttsMuted: boolean;
  ttsVolume: number;

  // ===== ASR 设置 =====
  asrProviderId: ASRProviderId;
  asrLanguage: string;
  asrEnabled: boolean;

  // ===== PDF 解析 =====
  pdfProviderId: PDFProviderId;

  // ===== 图片生成 =====
  imageProviderId: ImageProviderId;
  imageModelId: string;
  imageGenerationEnabled: boolean;

  // ===== 视频生成 =====
  videoProviderId: VideoProviderId;
  videoModelId: string;
  videoGenerationEnabled: boolean;

  // ===== 网页搜索 =====
  webSearchProviderId: WebSearchProviderId;

  // ===== 智能体设置 =====
  selectedAgentIds: string[];
  maxTurns: string;
  agentMode: 'preset' | 'auto';
  autoAgentCount: number;

  // ===== 播放控制 =====
  autoPlayLecture: boolean;
  playbackSpeed: PlaybackSpeed;  // 1 | 1.5 | 2

  // ===== 布局偏好 =====
  sidebarCollapsed: boolean;
  chatAreaCollapsed: boolean;
  chatAreaWidth: number;

  // ===== 自动配置 =====
  autoConfigApplied: boolean;

  // ===== Actions =====
  setModel: (providerId: ProviderId, modelId: string) => void;
  setProviderConfig: (providerId: ProviderId, config: Partial<...>) => void;
  // ...
}
```

### Zustand Persist 持久化

```typescript
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // 状态定义和 actions
    }),
    {
      name: 'settings-storage',
      version: 2,

      // 版本迁移
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<SettingsState>;

        // v0 → v1: 清除硬编码的默认模型
        if (version === 0) {
          if (state.providerId === 'openai' && state.modelId === 'gpt-4o-mini') {
            state.modelId = '';
          }
        }

        // v1 → v2: 替换深度研究为网页搜索
        if (version < 2) {
          delete (state as any).deepResearchProviderId;
        }

        return state;
      },

      // 自定义合并：确保内置提供者总是最新
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as object) };
        ensureBuiltInProviders(merged);
        return merged as SettingsState;
      },
    },
  ),
);
```

### 服务端提供者同步

```typescript
// 从服务器获取已配置的提供者并合并到本地状态
fetchServerProviders: async () => {
  const res = await fetch('/api/server-providers');
  const data = await res.json();

  set((state) => {
    // 标记服务端已配置的提供者
    for (const [pid, info] of Object.entries(data.providers)) {
      if (newProvidersConfig[pid]) {
        newProvidersConfig[pid] = {
          ...newProvidersConfig[pid],
          isServerConfigured: true,
          serverModels: info.models,
          serverBaseUrl: info.baseUrl,
        };
      }
    }

    // 首次运行时自动选择服务端提供者
    if (!state.autoConfigApplied) {
      // 自动选择 TTS/ASR/图片/视频提供者
      // ...
    }

    return { providersConfig: newProvidersConfig, autoConfigApplied: true };
  });
},
```

## MediaGenerationStore (media-generation.ts)

### 状态结构

```typescript
type MediaTaskStatus = 'pending' | 'generating' | 'done' | 'failed';

interface MediaTask {
  elementId: string;
  type: 'image' | 'video';
  status: MediaTaskStatus;
  prompt: string;
  params: {
    aspectRatio?: string;
    style?: string;
    duration?: number;
  };
  objectUrl?: string;  // URL.createObjectURL() 生成的 URL
  poster?: string;     // 视频封面
  error?: string;
  errorCode?: string;  // 结构化错误码 (如 'CONTENT_SENSITIVE')
  retryCount: number;
  stageId: string;
}

interface MediaGenerationState {
  tasks: Record<string, MediaTask>;

  enqueueTasks: (stageId: string, requests: MediaGenerationRequest[]) => void;
  markGenerating: (elementId: string) => void;
  markDone: (elementId: string, objectUrl: string, poster?: string) => void;
  markFailed: (elementId: string, error: string, errorCode?: string) => void;
  markPendingForRetry: (elementId: string) => void;
  getTask: (elementId: string) => MediaTask | undefined;
  isReady: (elementId: string) => boolean;
  restoreFromDB: (stageId: string) => Promise<void>;
  clearStage: (stageId: string) => void;
}
```

### 占位符检测

```typescript
// 检测是否为 AI 生成的媒体占位符 ID
function isMediaPlaceholder(src: string): boolean {
  return /^gen_(img|vid)_[\w-]+$/i.test(src);
}

// 示例：
// 'gen_img_abc123' → true (AI 生成的图片)
// 'gen_vid_xyz789' → true (AI 生成的视频)
// 'img_1' → false (PDF 提取的图片)
// 'https://...' → false (外部 URL)
```

### IndexedDB 恢复

```typescript
restoreFromDB: async (stageId) => {
  const records = await db.mediaFiles.where('stageId').equals(stageId).toArray();

  for (const rec of records) {
    if (rec.error) {
      // 恢复为失败状态
      restored[elementId] = { status: 'failed', error: rec.error, ... };
    } else {
      // 从 Blob 重新创建 Object URL
      const blob = rec.blob.type ? rec.blob : new Blob([rec.blob], { type: rec.mimeType });
      const objectUrl = URL.createObjectURL(blob);
      restored[elementId] = { status: 'done', objectUrl, ... };
    }
  }
},
```

## WhiteboardHistoryStore (whiteboard-history.ts)

### 撤销/重做栈

```typescript
interface WhiteboardHistoryState {
  past: WhiteboardSnapshot[];
  future: WhiteboardSnapshot[];

  pushSnapshot: (elements: WhiteboardElement[], description: string) => void;
  undo: () => WhiteboardSnapshot | undefined;
  redo: () => WhiteboardSnapshot | undefined;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

// 快照结构
interface WhiteboardSnapshot {
  elements: WhiteboardElement[];
  description: string;  // "AI 清空前" / "绘制文本" 等
  timestamp: number;
}
```

## Store 之间的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/store/                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  StageStore ──────────────┬──────────────── CanvasStore         │
│    │                      │                        │            │
│    │ scenes[]             │                        │            │
│    │   └── actions[]      │                        │            │
│    │                      │                        │            │
│    └──────────────────────┼────────────────────────┘            │
│                           │                                     │
│                           ▼                                     │
│                    PlaybackEngine                               │
│                    ActionEngine                                 │
│                           │                                     │
│                           ▼                                     │
│                    MediaGenerationStore                         │
│                    WhiteboardHistoryStore                       │
│                           │                                     │
│                           ▼                                     │
│                    SettingsStore                                │
│                    UserProfileStore                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用多 Store 而非单一 Store？

1. **职责分离**: Stage 管理数据，Canvas 管理 UI，Settings 管理配置
2. **重渲染优化**: 不相关状态变化不会触发组件重渲染
3. **持久化策略**: Settings 用 localStorage，Stage 用 IndexedDB
4. **可维护性**: 每个 Store 独立测试和调试

### 为什么使用 createSelectors？

1. **细粒度订阅**: `store.use.xxx()` 只在 xxx 变化时重渲染
2. **性能优化**: 避免大 Store 的不必要重渲染
3. **类型安全**: 保持完整的 TypeScript 类型推导

### 为什么 Settings 和 Stage 使用不同的持久化策略？

1. **数据大小**: Settings 较小（KB 级），Stage 可能很大（MB 级）
2. **同步需求**: Settings 需要同步读写，Stage 可以异步
3. **容量限制**: localStorage 有 5MB 限制，IndexedDB 更大

### 为什么 clearAllEffects 不清除视频播放状态？

```typescript
// 视觉效果有自动清除定时器（5秒后自动清除）
// 视频播放有独立的生命周期：
// 1. playVideo() 开始播放
// 2. 视频自然播放完成或用户暂停
// 3. onEnded 回调清除 playingVideoElementId

// 如果 clearAllEffects 清除了视频状态，会导致：
// - 视频还在播放但 UI 状态已清除
// - ActionEngine 无法正确等待视频播放完成
```
