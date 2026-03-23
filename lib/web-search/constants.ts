/**
 * 网络搜索提供者常量
 */

import type { WebSearchProviderId, WebSearchProviderConfig } from './types';

/**
 * 网络搜索提供者注册表
 */
export const WEB_SEARCH_PROVIDERS: Record<WebSearchProviderId, WebSearchProviderConfig> = {
  tavily: {
    id: 'tavily',
    name: 'Tavily',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.tavily.com',
  },
};

/**
 * 获取所有可用的网络搜索提供者
 */
export function getAllWebSearchProviders(): WebSearchProviderConfig[] {
  return Object.values(WEB_SEARCH_PROVIDERS);
}
