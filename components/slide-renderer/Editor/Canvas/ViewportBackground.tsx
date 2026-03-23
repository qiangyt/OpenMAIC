'use client';

import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import type { SlideContent } from '@/lib/types/stage';
import type { SlideBackground } from '@/lib/types/slides';

/**
 * 使用 Scene Context 的视口背景组件
 * 从当前场景数据渲染幻灯片背景
 */
export function ViewportBackground() {
  // 仅订阅背景以优化性能
  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );

  const { backgroundStyle: bgStyle } = useSlideBackgroundStyle(background);

  const backgroundStyle: React.CSSProperties = {
    ...bgStyle,
    width: '100%',
    height: '100%',
    backgroundPosition: 'center',
    position: 'absolute',
    pointerEvents: 'none', // 不阻挡鼠标事件
  };

  return <div className="viewport-background" style={backgroundStyle} />;
}
