/**
 * AI 服务提供者类型定义
 */

/**
 * 内置服务提供者 ID
 */
export type BuiltInProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'qwen'
  | 'kimi'
  | 'minimax'
  | 'glm'
  | 'siliconflow'
  | 'doubao';

/**
 * 服务提供者 ID（内置或自定义）
 * 对于自定义服务提供者，使用带 "custom-" 前缀的字符串字面量
 */
export type ProviderId = BuiltInProviderId | `custom-${string}`;

/**
 * 服务提供者 API 类型
 */
export type ProviderType = 'openai' | 'anthropic' | 'google';

/**
 * 描述模型的思考/推理 API 控制能力。
 * 不支持思考的模型只需从 capabilities 中省略此字段。
 */
export interface ThinkingCapability {
  /** 是否可以通过 API 完全禁用思考？ */
  toggleable: boolean;
  /** 是否可以调整思考预算/努力强度？ */
  budgetAdjustable: boolean;
  /** 默认是否启用思考（未传递配置时）？ */
  defaultEnabled: boolean;
}

/**
 * LLM 调用的统一思考配置。
 * 适配器将其映射为特定服务提供者的 providerOptions。
 */
export interface ThinkingConfig {
  /**
   * 是否启用思考。
   * - true：启用（使用模型默认值或指定的预算）
   * - false：禁用（适配器对不可切换的模型尽力而为）
   * - undefined：使用模型默认行为
   */
  enabled?: boolean;
  /**
   * 以 token 为单位的预算提示。仅在 enabled=true 或 undefined 时使用。
   * 适配器映射为每个服务提供者最接近的支持值。
   */
  budgetTokens?: number;
}

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  outputWindow?: number;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    thinking?: ThinkingCapability;
  };
}

/**
 * 服务提供者配置
 */
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  type: ProviderType;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  icon?: string;
  models: ModelInfo[];
}

/**
 * API 调用的模型配置
 */
export interface ModelConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  proxy?: string; // 可选：此服务提供者的 HTTP 代理 URL
  providerType?: ProviderType; // 可选：用于服务端的自定义服务提供者
  requiresApiKey?: boolean; // 可选：用于服务端的自定义服务提供者
}
