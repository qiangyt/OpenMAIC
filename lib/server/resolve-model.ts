/**
 * API 路由的共享模型解析工具。
 *
 * 将重复的 parseModelString → resolveApiKey → resolveBaseUrl →
 * resolveProxy → getModel 样板代码提取为单次调用。
 */

import type { NextRequest } from 'next/server';
import { getModel, parseModelString, type ModelWithInfo } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

export interface ResolvedModel extends ModelWithInfo {
  /** 原始模型字符串（例如 "openai/gpt-4o-mini"） */
  modelString: string;
  /** Effective API key after server-side fallback resolution */
  apiKey: string;
}

/**
 * 从显式参数解析语言模型。
 *
 * 当模型配置来自请求体时使用此函数。
 */
export function resolveModel(params: {
  modelString?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  requiresApiKey?: boolean;
}): ResolvedModel {
  const modelString = params.modelString || process.env.DEFAULT_MODEL || 'gpt-4o-mini';
  const { providerId, modelId } = parseModelString(modelString);

  const clientBaseUrl = params.baseUrl || undefined;
  if (clientBaseUrl && process.env.NODE_ENV === 'production') {
    const ssrfError = validateUrlForSSRF(clientBaseUrl);
    if (ssrfError) {
      throw new Error(ssrfError);
    }
  }

  const apiKey = clientBaseUrl
    ? params.apiKey || ''
    : resolveApiKey(providerId, params.apiKey || '');
  const baseUrl = clientBaseUrl ? clientBaseUrl : resolveBaseUrl(providerId, params.baseUrl);
  const proxy = resolveProxy(providerId);
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey,
    baseUrl,
    proxy,
    providerType: params.providerType as 'openai' | 'anthropic' | 'google' | undefined,
    requiresApiKey: params.requiresApiKey,
  });

  return { model, modelInfo, modelString, apiKey };
}

/**
 * 从标准请求头解析语言模型。
 *
 * 读取：x-model, x-api-key, x-base-url, x-provider-type, x-requires-api-key
 */
export function resolveModelFromHeaders(req: NextRequest): ResolvedModel {
  return resolveModel({
    modelString: req.headers.get('x-model') || undefined,
    apiKey: req.headers.get('x-api-key') || undefined,
    baseUrl: req.headers.get('x-base-url') || undefined,
    providerType: req.headers.get('x-provider-type') || undefined,
    requiresApiKey: req.headers.get('x-requires-api-key') === 'true' ? true : undefined,
  });
}
