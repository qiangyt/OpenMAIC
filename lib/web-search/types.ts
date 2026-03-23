/**
 * 网络搜索提供者类型定义
 */

/**
 * 网络搜索提供者 ID
 */
export type WebSearchProviderId = 'tavily';

/**
 * 网络搜索提供者配置
 */
export interface WebSearchProviderConfig {
  id: WebSearchProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  icon?: string;
}
