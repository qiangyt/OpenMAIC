'use client';

import { createContext, useContext } from 'react';

/**
 * 为媒体感知组件（BaseImageElement、BaseVideoElement）提供当前 stageId。
 *
 * 设置后，这些组件会订阅媒体生成 store，且仅使用 stageId 匹配的任务
 * （防止跨课程污染）。
 * 未定义时（如首页缩略图），将完全跳过 store 订阅。
 */
const MediaStageContext = createContext<string | undefined>(undefined);

export const MediaStageProvider = MediaStageContext.Provider;

export function useMediaStageId(): string | undefined {
  return useContext(MediaStageContext);
}
