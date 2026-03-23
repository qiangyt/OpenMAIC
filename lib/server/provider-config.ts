/**
 * 服务端提供商配置
 *
 * 从 YAML（主要）+ 环境变量（回退）加载提供商配置。
 * 密钥不会离开服务端 —— 只有提供商 ID 和元数据通过 API 暴露。
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createLogger } from '@/lib/logger';

const log = createLogger('ServerProviderConfig');

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface ServerProviderEntry {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
}

interface ServerConfig {
  providers: Record<string, ServerProviderEntry>;
  tts: Record<string, ServerProviderEntry>;
  asr: Record<string, ServerProviderEntry>;
  pdf: Record<string, ServerProviderEntry>;
  image: Record<string, ServerProviderEntry>;
  video: Record<string, ServerProviderEntry>;
  webSearch: Record<string, ServerProviderEntry>;
}

// ---------------------------------------------------------------------------
// 环境变量前缀映射
// ---------------------------------------------------------------------------

const LLM_ENV_MAP: Record<string, string> = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  KIMI: 'kimi',
  MINIMAX: 'minimax',
  GLM: 'glm',
  SILICONFLOW: 'siliconflow',
  DOUBAO: 'doubao',
};

const TTS_ENV_MAP: Record<string, string> = {
  TTS_OPENAI: 'openai-tts',
  TTS_AZURE: 'azure-tts',
  TTS_GLM: 'glm-tts',
  TTS_QWEN: 'qwen-tts',
};

const ASR_ENV_MAP: Record<string, string> = {
  ASR_OPENAI: 'openai-whisper',
  ASR_QWEN: 'qwen-asr',
};

const PDF_ENV_MAP: Record<string, string> = {
  PDF_UNPDF: 'unpdf',
  PDF_MINERU: 'mineru',
};

const IMAGE_ENV_MAP: Record<string, string> = {
  IMAGE_SEEDREAM: 'seedream',
  IMAGE_QWEN_IMAGE: 'qwen-image',
  IMAGE_NANO_BANANA: 'nano-banana',
};

const VIDEO_ENV_MAP: Record<string, string> = {
  VIDEO_SEEDANCE: 'seedance',
  VIDEO_KLING: 'kling',
  VIDEO_VEO: 'veo',
  VIDEO_SORA: 'sora',
};

const WEB_SEARCH_ENV_MAP: Record<string, string> = {
  TAVILY: 'tavily',
};

// ---------------------------------------------------------------------------
// YAML 加载
// ---------------------------------------------------------------------------

type YamlData = Partial<{
  providers: Record<string, Partial<ServerProviderEntry>>;
  tts: Record<string, Partial<ServerProviderEntry>>;
  asr: Record<string, Partial<ServerProviderEntry>>;
  pdf: Record<string, Partial<ServerProviderEntry>>;
  image: Record<string, Partial<ServerProviderEntry>>;
  video: Record<string, Partial<ServerProviderEntry>>;
  'web-search': Record<string, Partial<ServerProviderEntry>>;
}>;

function loadYamlFile(filename: string): YamlData {
  try {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as YamlData;
  } catch (e) {
    log.warn(`[ServerProviderConfig] Failed to load ${filename}:`, e);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 环境变量辅助函数
// ---------------------------------------------------------------------------

function loadEnvSection(
  envMap: Record<string, string>,
  yamlSection: Record<string, Partial<ServerProviderEntry>> | undefined,
): Record<string, ServerProviderEntry> {
  const result: Record<string, ServerProviderEntry> = {};

  // 首先，将 YAML 中的所有内容作为默认值添加
  if (yamlSection) {
    for (const [id, entry] of Object.entries(yamlSection)) {
      if (entry?.apiKey) {
        result[id] = {
          apiKey: entry.apiKey,
          baseUrl: entry.baseUrl,
          models: entry.models,
          proxy: entry.proxy,
        };
      }
    }
  }

  // 然后，应用环境变量（环境变量优先于 YAML）
  for (const [prefix, providerId] of Object.entries(envMap)) {
    const envApiKey = process.env[`${prefix}_API_KEY`] || undefined;
    const envBaseUrl = process.env[`${prefix}_BASE_URL`] || undefined;
    const envModelsStr = process.env[`${prefix}_MODELS`];
    const envModels = envModelsStr
      ? envModelsStr
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
      : undefined;

    if (result[providerId]) {
      // YAML 条目存在 —— 环境变量覆盖各个字段
      if (envApiKey) result[providerId].apiKey = envApiKey;
      if (envBaseUrl) result[providerId].baseUrl = envBaseUrl;
      if (envModels) result[providerId].models = envModels;
      continue;
    }

    if (!envApiKey) continue;
    result[providerId] = {
      apiKey: envApiKey,
      baseUrl: envBaseUrl,
      models: envModels,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// 模块级缓存（进程单例）
// ---------------------------------------------------------------------------

const DEFAULT_FILENAME = 'server-providers.yml';

/** 按 YAML 文件名作为键的缓存（空字符串 = 默认文件）。 */
const _configs: Map<string, ServerConfig> = new Map();

function buildConfig(yamlData: YamlData): ServerConfig {
  return {
    providers: loadEnvSection(LLM_ENV_MAP, yamlData.providers),
    tts: loadEnvSection(TTS_ENV_MAP, yamlData.tts),
    asr: loadEnvSection(ASR_ENV_MAP, yamlData.asr),
    pdf: loadEnvSection(PDF_ENV_MAP, yamlData.pdf),
    image: loadEnvSection(IMAGE_ENV_MAP, yamlData.image),
    video: loadEnvSection(VIDEO_ENV_MAP, yamlData.video),
    webSearch: loadEnvSection(WEB_SEARCH_ENV_MAP, yamlData['web-search']),
  };
}

function logConfig(config: ServerConfig, label: string): void {
  const counts = [
    Object.keys(config.providers).length,
    Object.keys(config.tts).length,
    Object.keys(config.asr).length,
    Object.keys(config.pdf).length,
    Object.keys(config.image).length,
    Object.keys(config.video).length,
    Object.keys(config.webSearch).length,
  ];
  if (counts.some((c) => c > 0)) {
    log.info(
      `[ServerProviderConfig] Loaded (${label}): ${counts[0]} LLM, ${counts[1]} TTS, ${counts[2]} ASR, ${counts[3]} PDF, ${counts[4]} Image, ${counts[5]} Video, ${counts[6]} WebSearch providers`,
    );
  }
}

function getConfig(): ServerConfig {
  const cached = _configs.get('');
  if (cached) return cached;

  const yamlData = loadYamlFile(DEFAULT_FILENAME);
  const config = buildConfig(yamlData);
  logConfig(config, DEFAULT_FILENAME);
  _configs.set('', config);
  return config;
}

// ---------------------------------------------------------------------------
// 公共 API — LLM
// ---------------------------------------------------------------------------

/** 返回服务端配置的 LLM 提供商（不包含 apiKeys） */
export function getServerProviders(): Record<string, { models?: string[]; baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { models?: string[]; baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.providers)) {
    result[id] = {};
    if (entry.models && entry.models.length > 0) result[id].models = entry.models;
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

/** 解析 API key：客户端 key > 服务端 key > 空字符串 */
export function resolveApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().providers[providerId]?.apiKey || '';
}

/** 解析 base URL：客户端 > 服务端 > undefined */
export function resolveBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return getConfig().providers[providerId]?.baseUrl;
}

/** 解析提供商的代理 URL（仅服务端配置） */
export function resolveProxy(providerId: string): string | undefined {
  return getConfig().providers[providerId]?.proxy;
}

// ---------------------------------------------------------------------------
// 公共 API — TTS
// ---------------------------------------------------------------------------

export function getServerTTSProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.tts)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveTTSApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().tts[providerId]?.apiKey || '';
}

export function resolveTTSBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return getConfig().tts[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// 公共 API — ASR
// ---------------------------------------------------------------------------

export function getServerASRProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.asr)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveASRApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().asr[providerId]?.apiKey || '';
}

export function resolveASRBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return getConfig().asr[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// 公共 API — PDF
// ---------------------------------------------------------------------------

export function getServerPDFProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.pdf)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolvePDFApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().pdf[providerId]?.apiKey || '';
}

export function resolvePDFBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return getConfig().pdf[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// 公共 API — 图片生成
// ---------------------------------------------------------------------------

export function getServerImageProviders(): Record<string, Record<string, never>> {
  const cfg = getConfig();
  const result: Record<string, Record<string, never>> = {};
  for (const id of Object.keys(cfg.image)) {
    result[id] = {};
  }
  return result;
}

export function resolveImageApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().image[providerId]?.apiKey || '';
}

export function resolveImageBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return getConfig().image[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// 公共 API — 视频生成
// ---------------------------------------------------------------------------

export function getServerVideoProviders(): Record<string, Record<string, never>> {
  const cfg = getConfig();
  const result: Record<string, Record<string, never>> = {};
  for (const id of Object.keys(cfg.video)) {
    result[id] = {};
  }
  return result;
}

export function resolveVideoApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().video[providerId]?.apiKey || '';
}

export function resolveVideoBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return getConfig().video[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// 公共 API — 网络搜索（Tavily）
// ---------------------------------------------------------------------------

/** 返回服务端配置的网络搜索提供商（不暴露 apiKeys） */
export function getServerWebSearchProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.webSearch)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

/** 解析 Tavily API key：客户端 key > 服务端 key > TAVILY_API_KEY 环境变量 > 空 */
export function resolveWebSearchApiKey(clientKey?: string): string {
  if (clientKey) return clientKey;
  const serverKey = getConfig().webSearch.tavily?.apiKey;
  if (serverKey) return serverKey;
  return process.env.TAVILY_API_KEY || '';
}
