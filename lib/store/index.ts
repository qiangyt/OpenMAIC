// 核心 Store
import { useCanvasStore } from './canvas';
import { useSnapshotStore } from './snapshot';
import { useKeyboardStore } from './keyboard';
import { useStageStore } from './stage';
import { useSettingsStore } from './settings';

export {
  // 新架构
  useCanvasStore,
  useStageStore,
  useSnapshotStore,
  useKeyboardStore,
  useSettingsStore,
};

// 场景上下文 API（用于可扩展的场景类型）
export { SceneProvider, useSceneData, useSceneSelector } from '@/lib/contexts/scene-context';
