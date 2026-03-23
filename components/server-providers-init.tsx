'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';

/**
 * 在挂载时获取服务器配置的提供商并合并到设置存储。
 * 不渲染任何内容 — 纯副作用组件。
 */
export function ServerProvidersInit() {
  const fetchServerProviders = useSettingsStore((state) => state.fetchServerProviders);

  useEffect(() => {
    fetchServerProviders();
  }, [fetchServerProviders]);

  return null;
}
