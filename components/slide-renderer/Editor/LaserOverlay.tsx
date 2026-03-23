'use client';

import { motion } from 'motion/react';
import type { PercentageGeometry } from '@/lib/types/action';

interface LaserOverlayProps {
  geometry: PercentageGeometry;
  color?: string;
  duration?: number;
}

/**
 * 激光笔覆盖层组件
 *
 * 功能：
 * - 从最近的角落平滑飞入到元素中心
 * - 优雅的光点带有柔和的呼吸发光效果
 * - 使用百分比定位 (0-100)
 */
export function LaserOverlay({
  geometry,
  color = '#ff3b30',
  duration: _duration = 3000,
}: LaserOverlayProps) {
  const { centerX, centerY } = geometry;

  const startPos = {
    x: centerX > 50 ? 105 : -5,
    y: centerY > 50 ? 105 : -5,
  };

  return (
    <motion.div
      key={`laser-${centerX}-${centerY}`}
      initial={{
        opacity: 0,
        left: `${startPos.x}%`,
        top: `${startPos.y}%`,
      }}
      animate={{
        opacity: 1,
        left: `${centerX}%`,
        top: `${centerY}%`,
      }}
      exit={{
        opacity: 0,
        left: `${startPos.x}%`,
        top: `${startPos.y}%`,
        transition: { duration: 0.25, ease: [0.4, 0, 1, 1] },
      }}
      transition={{
        left: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
        top: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.15 },
      }}
      className="absolute z-[101] pointer-events-none"
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        {/* 环形脉冲 */}
        <motion.div
          animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            ease: 'easeOut',
            repeatDelay: 0.3,
          }}
          className="absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${color}` }}
        />

        {/* 光芯 */}
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 8px 2px ${color}60`,
          }}
        />
      </div>
    </motion.div>
  );
}
