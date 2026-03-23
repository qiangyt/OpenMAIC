import { useMemo } from 'react';
import type { Slide } from '@/lib/types/slides';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { ThumbnailElement } from './ThumbnailElement';

interface ThumbnailSlideProps {
  /** 幻灯片数据 */
  readonly slide: Slide;
  /** 缩略图宽度 */
  readonly size: number;
  /** 视口宽度基准（默认 1000px） */
  readonly viewportSize: number;
  /** 视口宽高比（默认 0.5625 即 16:9） */
  readonly viewportRatio: number;
  /** 是否可见（用于懒加载优化） */
  readonly visible?: boolean;
}

/**
 * 缩略图幻灯片组件
 *
 * 渲染单个幻灯片的缩略图预览
 * 使用 CSS transform scale 来缩放整个视图以获得更好的性能
 */
export function ThumbnailSlide({
  slide,
  size,
  viewportSize,
  viewportRatio,
  visible = true,
}: ThumbnailSlideProps) {
  // 计算缩放比例
  const scale = useMemo(() => size / viewportSize, [size, viewportSize]);

  // 获取背景样式
  const { backgroundStyle } = useSlideBackgroundStyle(slide.background);

  if (!visible) {
    return (
      <div
        className="thumbnail-slide bg-white overflow-hidden select-none"
        style={{
          width: `${size}px`,
          height: `${size * viewportRatio}px`,
        }}
      >
        <div className="placeholder w-full h-full flex justify-center items-center text-gray-400 text-sm">
          加载中 ...
        </div>
      </div>
    );
  }

  return (
    <div
      className="thumbnail-slide bg-white overflow-hidden select-none"
      style={{
        width: `${size}px`,
        height: `${size * viewportRatio}px`,
      }}
    >
      <div
        className="elements origin-top-left"
        style={{
          width: `${viewportSize}px`,
          height: `${viewportSize * viewportRatio}px`,
          transform: `scale(${scale})`,
        }}
      >
        {/* 背景 */}
        <div className="background w-full h-full bg-center absolute" style={backgroundStyle} />

        {/* 渲染所有元素 */}
        {slide.elements.map((element, index) => (
          <ThumbnailElement key={element.id} elementInfo={element} elementIndex={index + 1} />
        ))}
      </div>
    </div>
  );
}
