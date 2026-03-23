/**
 * 统一 LLM 调用层
 *
 * 所有 LLM 交互都应通过 callLLM / streamLLM 进行。
 */

import { generateText, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import { createLogger } from '@/lib/logger';
import { PROVIDERS } from './providers';
import { thinkingContext } from './thinking-context';
import type { ProviderType, ThinkingCapability, ThinkingConfig } from '@/lib/types/provider';
const log = createLogger('LLM');

// 重新导出供外部使用
export type { ThinkingConfig } from '@/lib/types/provider';

// 重新导出 AI SDK 接受的参数类型
type GenerateTextParams = Parameters<typeof generateText>[0];
type StreamTextParams = Parameters<typeof streamText>[0];

function _extractRequestInfo(params: GenerateTextParams | StreamTextParams) {
  const tools = params.tools ? Object.keys(params.tools as Record<string, unknown>) : undefined;

  const p = params as Record<string, unknown>;
  return {
    system: p.system as string | undefined,
    prompt: p.prompt as string | undefined,
    messages: p.messages as unknown[] | undefined,
    tools,
    maxOutputTokens: p.maxOutputTokens as number | undefined,
  };
}

function getModelId(params: GenerateTextParams | StreamTextParams): string {
  const m = params.model;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object' && 'modelId' in m) return (m as { modelId: string }).modelId;
  return 'unknown';
}

// ---------------------------------------------------------------------------
// 思考/推理适配器
//
// 在模块加载时从 PROVIDERS 构建查找表，然后使用它将统一的 ThinkingConfig
// 映射为特定于提供者的 providerOptions。
// 目前处理：openai（原生）、anthropic（原生）、google（原生）。
// OpenAI 兼容的提供者（DeepSeek、Qwen、Kimi、GLM 等）不在此处理——
// 它们的厂商特定思考参数无法可靠地通过 Vercel AI SDK 的 createOpenAI 传递。
// ---------------------------------------------------------------------------

interface ModelThinkingInfo {
  providerType: ProviderType;
  thinking?: ThinkingCapability;
}

/** 模型 ID → 提供者类型 + 思考能力（模块加载时构建一次） */
const MODEL_THINKING_MAP: Map<string, ModelThinkingInfo> = (() => {
  const map = new Map<string, ModelThinkingInfo>();
  for (const provider of Object.values(PROVIDERS)) {
    for (const model of provider.models) {
      map.set(model.id, {
        providerType: provider.type,
        thinking: model.capabilities?.thinking,
      });
    }
  }
  return map;
})();

/** 从环境变量获取全局思考配置覆盖 */
function getGlobalThinkingConfig(): ThinkingConfig | undefined {
  if (process.env.LLM_THINKING_DISABLED === 'true') {
    return { enabled: false };
  }
  return undefined;
}

type ProviderOptions = Record<string, Record<string, unknown>>;

/**
 * 构建 providerOptions 以禁用思考，对于无法完全关闭的模型使用最低强度。
 */
function buildDisableThinking(
  modelId: string,
  providerType: ProviderType,
  _thinking: ThinkingCapability,
): ProviderOptions | undefined {
  switch (providerType) {
    case 'openai': {
      // GPT-5.1/5.2：支持 effort=none（完全关闭）
      // GPT-5/mini/nano：最低为 minimal
      // o 系列：最低为 low
      let effort: string;
      if (modelId.startsWith('gpt-5.')) {
        effort = 'none';
      } else if (modelId.startsWith('gpt-5')) {
        effort = 'minimal';
      } else if (modelId.startsWith('o')) {
        effort = 'low';
      } else {
        // 非思考型 OpenAI 模型（gpt-4o 等）——无需注入
        return undefined;
      }
      if (!_thinking.toggleable && effort !== 'none') {
        log.info(
          `[thinking-adapter] Model ${modelId} cannot fully disable thinking, using effort=${effort}`,
          // 中文：模型 ${modelId} 无法完全禁用思考，使用 effort=${effort}
        );
      }
      return { openai: { reasoningEffort: effort } };
    }

    case 'anthropic':
      // 所有 Claude 模型都支持 type=disabled
      return { anthropic: { thinking: { type: 'disabled' } } };

    case 'google': {
      // Gemini 3.x：使用 thinkingLevel（无法完全禁用）
      // Gemini 2.5 Flash/Flash-Lite：使用 thinkingBudget=0（完全关闭）
      // Gemini 2.5 Pro：最低 thinkingBudget=128（无法完全禁用）
      if (modelId.startsWith('gemini-3')) {
        const level = modelId.includes('flash') ? 'minimal' : 'low';
        log.info(
          `[thinking-adapter] Model ${modelId} cannot fully disable thinking, using thinkingLevel=${level}`,
          // 中文：模型 ${modelId} 无法完全禁用思考，使用 thinkingLevel=${level}
        );
        return { google: { thinkingConfig: { thinkingLevel: level } } };
      }
      if (modelId === 'gemini-2.5-pro') {
        log.info(
          `[thinking-adapter] Model ${modelId} cannot fully disable thinking, using thinkingBudget=128`,
          // 中文：模型 ${modelId} 无法完全禁用思考，使用 thinkingBudget=128
        );
        return { google: { thinkingConfig: { thinkingBudget: 128 } } };
      }
      // gemini-2.5-flash / flash-lite：可以完全禁用
      return { google: { thinkingConfig: { thinkingBudget: 0 } } };
    }

    default:
      return undefined;
  }
}

/**
 * 构建 providerOptions 以启用思考，可选地提供预算提示。
 */
function buildEnableThinking(
  modelId: string,
  providerType: ProviderType,
  _thinking: ThinkingCapability,
  budgetTokens?: number,
): ProviderOptions | undefined {
  switch (providerType) {
    case 'openai':
      // OpenAI 使用离散的 effort 级别，没有基于 token 的预算。
      // 不注入任何内容——让模型使用其默认 effort。
      return undefined;

    case 'anthropic': {
      // 4.6 模型：优先使用 adaptive（模型自动决定深度）
      // 4.5 模型：需要显式指定预算
      if (modelId.includes('4-6')) {
        if (budgetTokens !== undefined) {
          return { anthropic: { thinking: { type: 'enabled', budgetTokens } } };
        }
        return { anthropic: { thinking: { type: 'adaptive' } } };
      }
      // Sonnet 4.5 / Haiku 4.5：必须使用 enabled + budgetTokens
      const budget = budgetTokens ?? 10240; // 合理的默认值
      return {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: Math.max(1024, budget) },
        },
      };
    }

    case 'google': {
      // Gemini 3.x：使用 thinkingLevel（无数值预算）
      if (modelId.startsWith('gemini-3')) {
        return { google: { thinkingConfig: { thinkingLevel: 'high' } } };
      }
      // Gemini 2.5：使用 thinkingBudget
      if (budgetTokens !== undefined) {
        const min = modelId === 'gemini-2.5-pro' ? 128 : 0;
        return {
          google: {
            thinkingConfig: {
              thinkingBudget: Math.max(min, Math.min(24576, budgetTokens)),
            },
          },
        };
      }
      // 未指定预算——让模型使用动态默认值
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * 将统一的 ThinkingConfig 映射为特定于提供者的 providerOptions。
 */
function buildThinkingProviderOptions(
  modelId: string,
  config: ThinkingConfig,
): ProviderOptions | undefined {
  const info = MODEL_THINKING_MAP.get(modelId);
  if (!info?.thinking) return undefined; // 模型没有思考能力

  if (config.enabled === undefined) return undefined; // 使用模型默认值

  if (config.enabled === false) {
    return buildDisableThinking(modelId, info.providerType, info.thinking);
  }

  // enabled === true
  return buildEnableThinking(modelId, info.providerType, info.thinking, config.budgetTokens);
}

/**
 * 特定模型的默认 providerOptions（未提供 ThinkingConfig 时的回退）。
 * Gemini 3.x 模型使用 thinkingLevel 而非 thinkingBudget。
 */
function getDefaultProviderOptions(modelId: string): ProviderOptions | undefined {
  if (modelId === 'gemini-3.1-pro-preview') {
    return { google: { thinkingConfig: { thinkingLevel: 'high' } } };
  }
  return undefined;
}

/**
 * 将特定于提供者的思考选项注入到 LLM 调用参数中。
 *
 * 对于原生提供者（OpenAI/Anthropic/Google），这会设置 providerOptions。
 * 对于 OpenAI 兼容的提供者，providerOptions 不起作用（被 zod schema 过滤掉）——
 * 这些由 thinkingContext 通过自定义 fetch 包装器处理。
 *
 * 优先级：调用者的 providerOptions > ThinkingConfig > 模型默认值
 */
function injectProviderOptions<T extends GenerateTextParams | StreamTextParams>(
  params: T,
  thinking?: ThinkingConfig,
): T {
  if ((params as Record<string, unknown>).providerOptions) return params; // 调用者显式设置了 providerOptions

  const modelId = getModelId(params);

  if (thinking) {
    const opts = buildThinkingProviderOptions(modelId, thinking);
    if (opts) return { ...params, providerOptions: opts };
  }

  // 没有思考配置——使用模型默认值（向后兼容）
  const defaults = getDefaultProviderOptions(modelId);
  if (defaults) return { ...params, providerOptions: defaults };

  return params;
}

/**
 * LLM 调用验证失败时的重试选项。
 * 这与 AI SDK 内置的 maxRetries（处理网络/5xx 错误）是分开的。
 */
export interface LLMRetryOptions {
  /** 当 validate() 失败或响应为空时的最大重试次数（默认：0 = 不重试） */
  retries?: number;
  /** 自定义验证函数。返回 true 表示接受结果，false 表示重试。
   *  默认：检查响应文本非空。 */
  validate?: (text: string) => boolean;
}

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;

/**
 * `generateText` 的统一封装。
 *
 * @param params - 与 AI SDK 的 `generateText` 相同的参数
 * @param source - 用于日志分组的简短标签（如 'scene-stream'、'pbl-chat'）
 * @param retryOptions - 可选的验证失败重试设置
 * @param thinking - 可选的每次调用思考配置（覆盖全局 LLM_THINKING_DISABLED）
 */
export async function callLLM<T extends GenerateTextParams>(
  params: T,
  source: string,
  retryOptions?: LLMRetryOptions,
  thinking?: ThinkingConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<GenerateTextResult<any, any>> {
  const maxAttempts = (retryOptions?.retries ?? 0) + 1;
  const validate = retryOptions?.validate ?? (maxAttempts > 1 ? DEFAULT_VALIDATE : undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastResult: GenerateTextResult<any, any> | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 解析有效的思考配置：每次调用 > 全局环境变量 > undefined
      const effectiveThinking = thinking ?? getGlobalThinkingConfig();
      const injectedParams = injectProviderOptions(params, effectiveThinking);

      // 包装在 thinkingContext 中，以便 providers.ts 中的自定义 fetch 包装器
      // 可以读取配置并为 OpenAI 兼容的提供者注入厂商特定的 body 参数。
      const result = await thinkingContext.run(effectiveThinking, () =>
        generateText(injectedParams),
      );

      // 验证结果（仅当配置了重试时）
      if (validate && !validate(result.text)) {
        log.warn(
          `[${source}] Validation failed (attempt ${attempt}/${maxAttempts}), ${attempt < maxAttempts ? 'retrying...' : 'giving up'}`,
          // 中文：[${source}] 验证失败（第 ${attempt}/${maxAttempts} 次尝试），${attempt < maxAttempts ? '正在重试...' : '放弃'}
        );
        lastResult = result;
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        log.warn(`[${source}] Call failed (attempt ${attempt}/${maxAttempts}), retrying...`, error);
        // 中文：[${source}] 调用失败（第 ${attempt}/${maxAttempts} 次尝试），正在重试...
        continue;
      }
    }
  }

  // 所有尝试都已耗尽——返回最后的结果或抛出最后的错误
  if (lastResult) return lastResult;
  throw lastError;
}

/**
 * `streamText` 的统一封装。
 *
 * 返回相同的 StreamTextResult。
 *
 * @param params - 与 AI SDK 的 `streamText` 相同的参数
 * @param source - 用于日志分组的简短标签
 * @param thinking - 可选的每次调用思考配置（覆盖全局 LLM_THINKING_DISABLED）
 */
export function streamLLM<T extends StreamTextParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): StreamTextResult<any, any> {
  // 解析有效的思考配置并包装在 thinkingContext 中
  const effectiveThinking = thinking ?? getGlobalThinkingConfig();
  const injectedParams = injectProviderOptions(params, effectiveThinking);
  const result = thinkingContext.run(effectiveThinking, () => streamText(injectedParams));

  return result;
}
