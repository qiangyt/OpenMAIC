/**
 * 每次请求 ThinkingConfig 的异步上下文载体。
 *
 * callLLM / streamLLM 将每个 AI SDK 调用包装在 thinkingContext.run() 中，
 * 以便 providers.ts 中的自定义 fetch 包装器可以读取当前的思考偏好
 * 并注入厂商特定的 body 参数。
 *
 * 重要：此模块使用 node:async_hooks，仅限服务端。
 * providers.ts 不能直接导入此模块（它也通过 settings.ts 在客户端使用）。
 * 相反，providers.ts 通过 globalThis.__thinkingContext 读取上下文，
 * 该值在此处模块加载时设置，保证在任何 fetch 包装器运行前可用。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ThinkingConfig } from '@/lib/types/provider';

export const thinkingContext = new AsyncLocalStorage<ThinkingConfig | undefined>();

// 暴露在 globalThis 上，以便 providers.ts 可以访问存储而无需
// 导入此模块（这会通过 settings.ts → providers.ts 导入链
// 将 node:async_hooks 拉入客户端包）。
(globalThis as Record<string, unknown>).__thinkingContext = thinkingContext;
