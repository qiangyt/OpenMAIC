import type { ProviderId, ModelInfo, ProviderType } from '@/lib/types/provider';

export type SettingsSection =
  | 'general'
  | 'providers'
  | 'agents'
  | 'tts'
  | 'asr'
  | 'pdf'
  | 'image'
  | 'video'
  | 'web-search';

/**
 * 统一的服务提供者配置，以 JSON 格式存储
 * 将所有服务提供者特定的设置和元数据存储在一个对象中
 * 内置和自定义服务提供者使用相同的结构
 */
export interface ProviderSettings {
  // 配置
  apiKey: string;
  baseUrl: string;
  models: ModelInfo[]; // 所有模型（用户可编辑/删除任意模型）

  // 元数据（内置和自定义服务提供者相同）
  name: string;
  type: ProviderType;
  defaultBaseUrl?: string;
  icon?: string;
  requiresApiKey: boolean;
  isBuiltIn: boolean; // 内置服务提供者为 true，自定义服务提供者为 false

  // 服务端配置（由 fetchServerProviders 设置）
  isServerConfigured?: boolean; // 服务端是否为此服务提供者配置了 API 密钥
  serverModels?: string[]; // 服务端限制的模型列表（如果设置）
  serverBaseUrl?: string; // 服务端提供的基础 URL 覆盖
}

/**
 * 服务提供者配置存储格式
 * 键：providerId，值：ProviderSettings
 */
export type ProvidersConfig = Record<ProviderId, ProviderSettings>;

export interface EditingModel {
  providerId: ProviderId;
  modelIndex: number | null; // null 表示新模型
  model: ModelInfo;
}
