'use client';

import Canvas from './Canvas';
import type { StageMode } from '@/lib/types/stage';
import { ScreenCanvas } from './ScreenCanvas';

/**
 * 幻灯片编辑器 - 使用 SceneProvider 包装 Canvas
 */
export function SlideEditor({ mode }: { readonly mode: StageMode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        {mode === 'autonomous' ? <Canvas /> : <ScreenCanvas />}
      </div>
    </div>
  );
}
