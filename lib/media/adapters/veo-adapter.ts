/**
 * Veo（Google）视频生成适配器
 *
 * 使用 Google Veo 模型进行视频生成的直接 REST API 调用。
 * 异步任务模式：提交 → 轮询 → 返回内联 base64 视频。
 *
 * REST 端点（Gemini API）：
 * - 提交：POST /v1beta/models/{model}:predictLongRunning
 * - 轮询：POST /v1beta/models/{model}:fetchPredictOperation  { operationName }
 *   在 response.videos[] 中返回内联 base64 视频数据
 *
 * 支持的模型：
 * - veo-3.1-fast-generate-001（快速，$0.15/秒）
 * - veo-3.1-generate-001（高质量，$0.40/秒）
 * - veo-3.0-fast-generate-001（快速，$0.15/秒）
 * - veo-3.0-generate-001（高质量，$0.40/秒）
 * - veo-2.0-generate-001（旧版，$0.50/秒）
 *
 * 认证：x-goog-api-key header
 *
 * 无状态：视频内容以 base64 data URL 形式返回。
 * 服务器上不保存任何文件。
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'veo-3.0-generate-001';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_POLL_ATTEMPTS = 60; // 10 minutes max

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 各宽高比的默认尺寸 */
function getDimensions(aspectRatio?: string): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:3':
      return { width: 1024, height: 768 };
    default:
      return { width: 1280, height: 720 }; // 16:9
  }
}

/** 所有 Veo API 调用的通用 headers */
function apiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

// ---------------------------------------------------------------------------
// REST 类型（与官方 Gemini API 响应格式匹配）
// ---------------------------------------------------------------------------

interface VeoOperation {
  name: string;
  done?: boolean;
  response?: {
    /** fetchPredictOperation 返回内联 base64 视频数据 */
    videos?: Array<{
      bytesBase64Encoded?: string; // base64 编码的视频字节
      mimeType?: string; // 例如 "video/mp4"
    }>;
  };
  error?: { code: number; message: string; status: string };
}

// ---------------------------------------------------------------------------
// 提交
// ---------------------------------------------------------------------------

async function submitVideoGeneration(
  baseUrl: string,
  apiKey: string,
  model: string,
  options: VideoGenerationOptions,
): Promise<VeoOperation> {
  const url = `${baseUrl}/v1beta/models/${model}:predictLongRunning`;

  const body: Record<string, unknown> = {
    instances: [{ prompt: options.prompt }],
  };

  // 参数可选 —— 仅在有值时包含
  const parameters: Record<string, unknown> = {};
  if (options.aspectRatio) parameters.aspectRatio = options.aspectRatio;
  if (options.duration) parameters.durationSeconds = options.duration;
  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Veo submit failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<VeoOperation>;
}

// ---------------------------------------------------------------------------
// 轮询
// ---------------------------------------------------------------------------

async function pollOperation(
  baseUrl: string,
  apiKey: string,
  model: string,
  operationName: string,
): Promise<VeoOperation> {
  const url = `${baseUrl}/v1beta/models/${model}:fetchPredictOperation`;

  const response = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ operationName }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Veo poll failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<VeoOperation>;
}

// ---------------------------------------------------------------------------
// 公共入口点
// ---------------------------------------------------------------------------

/**
 * 轻量级连接测试 —— 通过获取模型信息验证 API 密钥。
 * 使用 GET /v1beta/models/{model}，不会触发生成。
 */
export async function testVeoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const model = config.model || DEFAULT_MODEL;
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const url = `${baseUrl}/v1beta/models`;

  // 首先尝试 ?key= 查询参数（直接 Google API），回退到 x-goog-api-key header（代理）
  let response: Response | null = null;
  try {
    response = await fetch(`${url}?key=${config.apiKey}`, { method: 'GET' });
  } catch {
    // 直接 API 不可达，尝试 header 认证
  }
  if (!response || !response.ok) {
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': config.apiKey },
      });
    } catch (_err) {
      return {
        success: false,
        message: `Network error: unable to reach ${baseUrl}. Check your Base URL and network connection.`,
      };
    }
  }

  if (response.ok) {
    return { success: true, message: `Connected to Veo (${model})` };
  }

  // 解析错误响应体以获取用户友好的消息
  const text = await response.text().catch(() => '');
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return {
      success: false,
      message: `Invalid API key or unauthorized (${response.status}). Check your API Key and Base URL match the same provider.`,
    };
  }
  return {
    success: false,
    message: `Veo connectivity failed (${response.status}): ${text}`,
  };
}

export async function generateWithVeo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const model = config.model || DEFAULT_MODEL;
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  // 1. 提交
  const operation = await submitVideoGeneration(baseUrl, config.apiKey, model, options);

  if (!operation.name) {
    throw new Error('Veo returned operation without name');
  }

  // 2. 轮询直到完成
  let current = operation;
  let pollCount = 0;
  while (!current.done) {
    if (pollCount >= MAX_POLL_ATTEMPTS) {
      throw new Error('Veo video generation timed out after 10 minutes');
    }
    await delay(POLL_INTERVAL_MS);
    current = await pollOperation(baseUrl, config.apiKey, model, current.name);
    pollCount++;
  }

  // 3. 检查错误
  if (current.error) {
    throw new Error(`Veo generation failed: ${current.error.code} - ${current.error.message}`);
  }

  // 4. 从 response.videos[] 中提取内联 base64 视频
  const videos = current.response?.videos;
  if (!videos || videos.length === 0) {
    throw new Error('Veo returned no generated videos');
  }

  const first = videos[0];
  if (!first.bytesBase64Encoded) {
    throw new Error('Veo returned video entry without data');
  }

  const base64 = first.bytesBase64Encoded;
  const mimeType = first.mimeType || 'video/mp4';

  const { width, height } = getDimensions(options.aspectRatio);

  return {
    url: `data:${mimeType};base64,${base64}`,
    duration: options.duration || 8,
    width,
    height,
  };
}
