/**
 * Prompt 加载器 - 从 markdown 文件加载 Prompt
 *
 * 支持:
 * - 从 templates/{promptId}/ 目录加载 Prompt
 * - 通过 {{snippet:name}} 语法引入片段
 * - 通过 {{variable}} 语法进行变量插值
 * - 缓存以提高性能
 */

import fs from 'fs';
import path from 'path';
import type { PromptId, LoadedPrompt, SnippetId } from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('PromptLoader');

// 已加载的 Prompt 和片段的缓存
const promptCache = new Map<string, LoadedPrompt>();
const snippetCache = new Map<string, string>();

/**
 * 获取 prompts 目录路径
 */
function getPromptsDir(): string {
  // 在 Next.js 中，使用 process.cwd() 获取项目根目录
  return path.join(process.cwd(), 'lib', 'generation', 'prompts');
}

/**
 * 按 ID 加载片段
 */
export function loadSnippet(snippetId: SnippetId): string {
  const cached = snippetCache.get(snippetId);
  if (cached) return cached;

  const snippetPath = path.join(getPromptsDir(), 'snippets', `${snippetId}.md`);

  try {
    const content = fs.readFileSync(snippetPath, 'utf-8').trim();
    snippetCache.set(snippetId, content);
    return content;
  } catch {
    log.warn(`Snippet not found: ${snippetId}`);
    return `{{snippet:${snippetId}}}`;
  }
}

/**
 * 处理模板中的片段引入
 * 将 {{snippet:name}} 替换为实际的片段内容
 */
function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

/**
 * 按 ID 加载 Prompt
 */
export function loadPrompt(promptId: PromptId): LoadedPrompt | null {
  const cached = promptCache.get(promptId);
  if (cached) return cached;

  const promptDir = path.join(getPromptsDir(), 'templates', promptId);

  try {
    // 加载 system.md
    const systemPath = path.join(promptDir, 'system.md');
    let systemPrompt = fs.readFileSync(systemPath, 'utf-8').trim();
    systemPrompt = processSnippets(systemPrompt);

    // 加载 user.md（可选，可能不存在）
    const userPath = path.join(promptDir, 'user.md');
    let userPromptTemplate = '';
    try {
      userPromptTemplate = fs.readFileSync(userPath, 'utf-8').trim();
      userPromptTemplate = processSnippets(userPromptTemplate);
    } catch {
      // user.md 是可选的
    }

    const loaded: LoadedPrompt = {
      id: promptId,
      systemPrompt,
      userPromptTemplate,
    };

    promptCache.set(promptId, loaded);
    return loaded;
  } catch (error) {
    log.error(`Failed to load prompt ${promptId}:`, error);
    return null;
  }
}

/**
 * 在模板中进行变量插值
 * 将 {{variable}} 替换为 variables 对象中的值
 */
export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * 构建带变量的完整 Prompt
 */
export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  return {
    system: interpolateVariables(prompt.systemPrompt, variables),
    user: interpolateVariables(prompt.userPromptTemplate, variables),
  };
}

/**
 * 清除所有缓存（用于开发/测试）
 */
export function clearPromptCache(): void {
  promptCache.clear();
  snippetCache.clear();
}
