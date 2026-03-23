/**
 * Tavily 网络搜索集成
 *
 * 通过 proxyFetch 使用原生 REST API 以支持可靠的代理。
 * Tavily 搜索端点：POST https://api.tavily.com/search
 */

import { proxyFetch } from '@/lib/server/proxy-fetch';
import type { WebSearchResult, WebSearchSource } from '@/lib/types/web-search';

const TAVILY_API_URL = 'https://api.tavily.com/search';

const TAVILY_MAX_QUERY_LENGTH = 400;

/**
 * 使用 Tavily REST API 进行网络搜索并返回结构化结果。
 */
export async function searchWithTavily(params: {
  query: string;
  apiKey: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const { query, apiKey, maxResults = 5 } = params;

  // Tavily rejects queries over 400 characters with a 400 error
  const truncatedQuery = query.slice(0, TAVILY_MAX_QUERY_LENGTH);

  const res = await proxyFetch(TAVILY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: truncatedQuery,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: 'basic',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Tavily API error (${res.status}): ${errorText || res.statusText}`);
  }

  const data = (await res.json()) as {
    answer?: string;
    query: string;
    response_time: number;
    results: Array<{
      title: string;
      url: string;
      content: string;
      score: number;
    }>;
  };

  const sources: WebSearchSource[] = (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
  }));

  return {
    answer: data.answer || '',
    sources,
    query: data.query,
    responseTime: data.response_time,
  };
}

/**
 * 将搜索结果格式化为 LLM 提示词的 markdown 上下文块。
 */
export function formatSearchResultsAsContext(result: WebSearchResult): string {
  if (!result.answer && result.sources.length === 0) {
    return '';
  }

  const lines: string[] = [];

  if (result.answer) {
    lines.push(result.answer);
    lines.push('');
  }

  if (result.sources.length > 0) {
    lines.push('Sources:');
    for (const src of result.sources) {
      lines.push(`- [${src.title}](${src.url}): ${src.content.slice(0, 200)}`);
    }
  }

  return lines.join('\n');
}
