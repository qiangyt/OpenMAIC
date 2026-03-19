# React Context 模块 (lib/contexts/)

> 场景数据 Context Provider

## 概览

本模块提供场景数据的 React Context，用于在组件树中共享场景状态和操作方法。

## 核心文件

| 文件 | 职责 |
|------|------|
| `scene-context.tsx` | 场景数据 Context 和 Hooks |
| `media-stage-context.tsx` | 媒体暂存 Context |

## SceneContext

### 使用方式

```typescript
import {
  SceneProvider,
  useSceneData,
  useSceneSelector,
} from '@/lib/contexts/scene-context';

// 在组件树顶部包裹 Provider
<SceneProvider sceneId="scene_1" initialData={sceneData}>
  <ChildComponent />
</SceneProvider>

// 在子组件中使用
function ChildComponent() {
  // 获取场景数据更新函数
  const { updateSceneData } = useSceneData<SlideContent>();

  // 选择器模式（避免不必要的重渲染）
  const canvas = useSceneSelector<SlideContent, Slide>(
    (content) => content.canvas
  );

  // 更新数据
  updateSceneData((draft) => {
    draft.canvas.elements.push(newElement);
  });
}
```

### Context 值

```typescript
interface SceneContextValue<T = unknown> {
  sceneId: string;
  sceneType: Scene['type'];
  sceneData: T;
  updateSceneData: (updater: (draft: T) => void) => void;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => T;
}
```

### 特点

1. **Immer 集成**: 使用 `produce` 进行不可变更新
2. **useSyncExternalStore**: 兼容 React 18 并发渲染
3. **类型安全**: 泛型支持不同场景内容类型

## MediaStageContext

```typescript
import { MediaStageProvider, useMediaStage } from '@/lib/contexts/media-stage-context';

// 用于暂存媒体生成状态的临时 Context
<MediaStageProvider>
  <MediaComponents />
</MediaStageProvider>

const { pendingMedia, setPendingMedia } = useMediaStage();
```

## 与其他模块的关系

```
lib/contexts/
    │
    ├── 依赖: lib/store/stage.ts (场景 Store)
    │         lib/types/stage.ts (场景类型)
    │         immer (不可变数据)
    │
    └── 被依赖: components/* (所有场景组件)
               lib/hooks/use-canvas-operations.ts
```
