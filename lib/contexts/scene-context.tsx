'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useSyncExternalStore,
  useRef,
  useEffect,
} from 'react';
import { useStageStore } from '@/lib/store/stage';
import type { Scene } from '@/lib/types/stage';
import { produce } from 'immer';

interface SceneContextValue<T = unknown> {
  sceneId: string;
  sceneType: Scene['type'];
  sceneData: T;
  updateSceneData: (updater: (draft: T) => void) => void;
  // 内部：订阅场景数据变更
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => T;
}

const SceneContext = createContext<SceneContextValue | null>(null);

/**
 * 通用场景提供者
 * 为子组件提供当前场景数据和更新方法
 * 自动将变更同步回 stageStore
 *
 * 用法：
 * <SceneProvider>
 *   <SlideRenderer /> // 使用 useSceneData<SlideContent>()
 * </SceneProvider>
 */
export function SceneProvider({ children }: { children: React.ReactNode }) {
  // 订阅当前场景
  const currentScene = useStageStore((state) => {
    if (!state.currentSceneId) return null;
    return state.scenes.find((s) => s.id === state.currentSceneId) || null;
  });

  const updateScene = useStageStore((state) => state.updateScene);

  const sceneId = currentScene?.id || '';
  const sceneType = currentScene?.type || 'slide';
  const sceneData = currentScene?.content || null;

  // 场景数据变更的监听器
  const listenersRef = useRef(new Set<() => void>());

  // 供子组件使用的订阅函数
  const subscribe = useCallback((callback: () => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  // 获取当前快照
  const getSnapshot = useCallback(() => {
    return sceneData;
  }, [sceneData]);

  // 当 sceneData 变更时通知所有监听器
  useEffect(() => {
    listenersRef.current.forEach((listener) => listener());
  }, [sceneData]);

  // 使用 Immer 更新场景数据
  const updateSceneData = useCallback(
    (updater: (draft: unknown) => void) => {
      if (!currentScene) return;

      const newContent = produce(currentScene.content, updater);
      updateScene(currentScene.id, {
        content: newContent,
      });
    },
    [currentScene, updateScene],
  );

  const value = useMemo(
    () => ({
      sceneId,
      sceneType,
      sceneData,
      updateSceneData,
      subscribe,
      getSnapshot,
    }),
    [sceneId, sceneType, sceneData, updateSceneData, subscribe, getSnapshot],
  );

  // 如果没有场景则不渲染任何内容 - 让父组件处理此情况
  if (!currentScene) {
    return null;
  }

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

/**
 * 访问当前场景数据的 Hook
 * 使用泛型实现类型安全
 *
 * @example
 * // 在 SlideRenderer 中
 * const { sceneData, updateSceneData } = useSceneData<SlideContent>();
 * const Canvas = sceneData.Canvas;
 *
 * // 更新 Canvas 背景
 * updateSceneData(draft => {
 *   draft.Canvas.background = { type: 'solid', color: '#fff' };
 * });
 */
export function useSceneData<T = unknown>(): SceneContextValue<T> {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error('useSceneData must be used within SceneProvider');
  }
  return context as SceneContextValue<T>;
}

/**
 * 订阅场景数据特定部分的 Hook
 * **精确订阅** - 仅当选择器返回值变更时才重新渲染
 *
 * 工作原理：
 * 1. 使用 useSyncExternalStore 订阅外部数据源
 * 2. 选择器提取所需的数据切片
 * 3. React 自动执行浅比较，仅当返回值变更时才触发重新渲染
 *
 * @example
 * // 仅订阅背景；元素的变更不会触发重新渲染
 * const background = useSceneSelector<SlideContent>(
 *   content => content.Canvas.background
 * );
 */
export function useSceneSelector<T = unknown, R = unknown>(selector: (data: T) => R): R {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error('useSceneSelector must be used within SceneProvider');
  }

  const { subscribe, getSnapshot } = context as SceneContextValue<T>;

  // 缓存选择器和上一次的结果
  const selectorRef = useRef(selector);
  const snapshotRef = useRef<R | undefined>(undefined);

  // 更新选择器引用
  useEffect(() => {
    selectorRef.current = selector;
  }, [selector]);

  // 使用 useSyncExternalStore 实现精确订阅
  return useSyncExternalStore(
    subscribe,
    () => {
      const snapshot = getSnapshot();
      const newValue = selectorRef.current(snapshot);

      // 浅比较优化：如果值未变更，返回之前的引用
      if (snapshotRef.current !== undefined && shallowEqual(snapshotRef.current, newValue)) {
        return snapshotRef.current;
      }

      snapshotRef.current = newValue;
      return newValue;
    },
    () => {
      // SSR 回退
      const snapshot = getSnapshot();
      return selectorRef.current(snapshot);
    },
  );
}

/**
 * 浅比较函数
 * 用于优化 useSceneSelector 的重新渲染
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }

  return true;
}
