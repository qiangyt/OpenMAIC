/**
 * Seedance（字节跳动 / 豆包 / 方舟）视频生成适配器
 *
 * 使用异步任务模式：提交任务 → 轮询直到成功 → 获取视频 URL。
 * 端点：https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
 *
 * 请求格式（文本生成视频）：
 *   POST /api/v3/contents/generations/tasks
 *   {
 *     "model": "doubao-seedance-1-5-pro-251215",
 *     "content": [{ "type": "text", "text": "提示词" }],
 *     "ratio": "16:9",
 *     "duration": 5,
 *     "resolution": "1080p",
 *     "watermark": false
 *   }
 *
 * 支持的模型：
 * - doubao-seedance-1-5-pro-251215（最新，4~12秒）
 * - doubao-seedance-1-0-pro-250528（稳定，2~12秒）
 * - doubao-seedance-1-0-pro-fast-251015（更快，2~12秒）
 * - doubao-seedance-1-0-lite-t2v-250428（轻量，2~12秒）
 *
 * API 文档：https://www.volcengine.com/docs/6492/2165104
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'doubao-seedance-1-5-pro-251215';
const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max

/** 任务创建的响应结构（仅返回 id） */
interface SeedanceSubmitResponse {
  id: string;
}

/** 任务轮询的响应结构 */
interface SeedancePollResponse {
  id: string;
  model: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  content?: {
    video_url?: string;
  };
  resolution?: string;
  ratio?: string;
  duration?: number;
  framespersecond?: number;
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * 将宽高比映射到 Seedance 的 ratio 格式。
 * Seedance 使用与我们相同的 "W:H" 格式。
 */
function toSeedanceRatio(aspectRatio?: string): string | undefined {
  if (!aspectRatio) return undefined;
  return aspectRatio; // Already in "16:9" format
}

/**
 * 将分辨率映射到 Seedance 格式。
 * Seedance 期望 "480p"、"720p"、"1080p"。
 */
function toSeedanceResolution(resolution?: string): string | undefined {
  if (!resolution) return undefined;
  return resolution; // Already in "720p" format
}

/**
 * 根据宽高比和分辨率估算结果的视频尺寸。
 */
function estimateDimensions(
  ratio?: string,
  resolution?: string,
): { width: number; height: number } {
  const resMap: Record<string, number> = {
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
  };
  const h = resMap[resolution || '720p'] || 720;

  if (!ratio) return { width: Math.round((h * 16) / 9), height: h };
  const [w, hRatio] = ratio.split(':').map(Number);
  if (!w || !hRatio) return { width: Math.round((h * 16) / 9), height: h };
  return { width: Math.round((h * w) / hRatio), height: h };
}

/**
 * 向 Seedance API 提交视频生成任务。
 * 返回用于轮询的任务 ID。
 */
/**
 * 轻量级连接测试 —— 通过 GET 请求轮询不存在的任务来验证 API 密钥。
 * 如果认证失败返回 401/403；如果认证成功返回 404（任务未找到），确认密钥有效。
 */
export async function testSeedanceConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  try {
    const response = await fetch(
      `${baseUrl}/api/v3/contents/generations/tasks/connectivity-test-nonexistent`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      },
    );
    // 401/403 表示密钥无效；任何其他状态（404、400、200）表示密钥有效
    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      return {
        success: false,
        message: `Seedance auth failed (${response.status}): ${text}`,
      };
    }
    return { success: true, message: 'Connected to Seedance' };
  } catch (err) {
    return { success: false, message: `Seedance connectivity error: ${err}` };
  }
}

export async function submitSeedanceTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const body: Record<string, unknown> = {
    model: config.model || DEFAULT_MODEL,
    content: [
      {
        type: 'text',
        text: options.prompt,
      },
    ],
    watermark: false,
  };

  const ratio = toSeedanceRatio(options.aspectRatio);
  if (ratio) body.ratio = ratio;

  if (options.duration) body.duration = options.duration;

  const resolution = toSeedanceResolution(options.resolution);
  if (resolution) body.resolution = resolution;

  const response = await fetch(`${baseUrl}/api/v3/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Seedance task submission failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SeedanceSubmitResponse;
  if (!data.id) {
    throw new Error('Seedance returned empty task ID');
  }

  return data.id;
}

/**
 * 轮询 Seedance 视频生成任务的状态。
 * 如完成则返回结果，如仍在运行则返回 null。
 * 失败时抛出异常。
 */
export async function pollSeedanceTask(
  config: VideoGenerationConfig,
  taskId: string,
): Promise<VideoGenerationResult | null> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const response = await fetch(`${baseUrl}/api/v3/contents/generations/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Seedance poll failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SeedancePollResponse;

  if (data.status === 'succeeded') {
    if (!data.content?.video_url) {
      throw new Error('Seedance task succeeded but no video URL returned');
    }
    const dims = estimateDimensions(data.ratio, data.resolution);
    return {
      url: data.content.video_url,
      duration: data.duration || 5,
      width: dims.width,
      height: dims.height,
    };
  }

  if (data.status === 'failed') {
    throw new Error(`Seedance video generation failed: ${data.error?.message || 'Unknown error'}`);
  }

  // 排队中或运行中
  return null;
}

/**
 * 使用 Seedance 生成视频：提交任务 + 轮询直到完成。
 */
export async function generateWithSeedance(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitSeedanceTask(config, options);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollSeedanceTask(config, taskId);
    if (result) return result;
  }

  throw new Error(
    `Seedance video generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (task: ${taskId})`,
  );
}
