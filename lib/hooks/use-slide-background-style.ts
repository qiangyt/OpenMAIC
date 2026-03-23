import { useMemo } from 'react';
import type { SlideBackground } from '@/lib/types/slides';

/**
 * 将幻灯片背景数据转换为 CSS 样式
 */
export function useSlideBackgroundStyle(background: SlideBackground | undefined) {
  const backgroundStyle = useMemo<React.CSSProperties>(() => {
    if (!background) return { backgroundColor: '#fff' };

    const { type, color, image, gradient } = background;

    // 纯色背景
    if (type === 'solid') return { backgroundColor: color };

    // 图片背景模式
    // 包含：背景图片、背景大小、是否重复
    if (type === 'image' && image) {
      const { src, size } = image;
      if (!src) return { backgroundColor: '#fff' };
      if (size === 'repeat') {
        return {
          backgroundImage: `url(${src})`,
          backgroundRepeat: 'repeat',
          backgroundSize: 'contain',
        };
      }
      return {
        backgroundImage: `url(${src})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: size || 'cover',
      };
    }

    // 渐变背景
    if (type === 'gradient' && gradient) {
      const { type, colors, rotate } = gradient;
      const list = colors.map((item) => `${item.color} ${item.pos}%`);

      if (type === 'radial') {
        return { backgroundImage: `radial-gradient(${list.join(',')})` };
      }
      return {
        backgroundImage: `linear-gradient(${rotate}deg, ${list.join(',')})`,
      };
    }

    return { backgroundColor: '#fff' };
  }, [background]);

  return {
    backgroundStyle,
  };
}
