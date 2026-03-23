/**
 * 服务端代理感知的 fetch 工具。
 *
 * 当设置了标准环境变量时，自动通过 HTTP/HTTPS 代理路由请求：
 *   - https_proxy / HTTPS_PROXY
 *   - http_proxy / HTTP_PROXY
 *
 * Node.js 内置的 fetch 不遵循这些环境变量，
 * 因此我们在配置代理时使用 undici 的 ProxyAgent。
 *
 * 用法：import { proxyFetch } from '@/lib/server/proxy-fetch';
 *       const res = await proxyFetch('https://api.openai.com/v1/...', { ... });
 */

import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyFetch');

function getProxyUrl(): string | undefined {
  return (
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY ||
    undefined
  );
}

let cachedAgent: ProxyAgent | null = null;
let cachedProxyUrl: string | undefined;

function getProxyAgent(): ProxyAgent | undefined {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;

  // 如果代理 URL 未改变，则复用 agent
  if (cachedAgent && cachedProxyUrl === proxyUrl) {
    return cachedAgent;
  }

  cachedAgent = new ProxyAgent(proxyUrl);
  cachedProxyUrl = proxyUrl;
  return cachedAgent;
}

/**
 * fetch() 的直接替代品，遵循代理环境变量。
 * 当未配置代理时回退到全局 fetch。
 */
export async function proxyFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const agent = getProxyAgent();
  const url = typeof input === 'string' ? input : input.toString();

  if (!agent) {
    log.info('No proxy configured, using direct fetch for:', url.slice(0, 80));
    return fetch(input, init);
  }

  log.info('Using proxy', cachedProxyUrl, 'for:', url.slice(0, 80));
  // 使用 undici 的 fetch 配合代理分发器
  const res = await undiciFetch(input, {
    ...(init as UndiciRequestInit),
    dispatcher: agent,
  });

  // undici 的 Response 与全局 Response 兼容
  return res as unknown as Response;
}
