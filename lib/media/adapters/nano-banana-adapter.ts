/**
 * Nano Banana / Gemini 原生图像生成适配器
 *
 * 使用 Google Gemini 的原生图像生成能力。
 * 端点：https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *
 * 支持的模型：
 * - gemini-3.1-flash-image-preview（Nano Banana 2 —— 最新、最快）
 * - gemini-3-pro-image-preview（Nano Banana Pro —— 最高质量）
 * - gemini-2.5-flash-image（Nano Banana —— 原版）
 *
 * 认证：x-goog-api-key header
 *
 * API 文档：https://ai.google.dev/gemini-api/docs/image-generation
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * 轻量级连接测试 —— 通过获取模型信息验证 API 密钥。
 * 使用 GET /v1beta/models/{model}，不会触发生成。
 */
export async function testNanoBananaConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const model = config.model || DEFAULT_MODEL;
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
    return { success: true, message: `Connected to Nano Banana (${model})` };
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
    message: `Nano Banana connectivity failed (${response.status}): ${text}`,
  };
}

export async function generateWithNanoBanana(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const model = config.model || DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: options.prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini image generation failed (${response.status}): ${text}`);
  }

  const data: GeminiResponse = await response.json();

  if (data.error) {
    throw new Error(`Gemini error: ${data.error.code} - ${data.error.message}`);
  }

  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('Gemini returned empty response');
  }

  // 查找图像部分（带 base64 的 inlineData）
  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart?.inlineData) {
    // 可能只返回了文本（例如提示词被拒绝）
    const textPart = parts.find((p) => p.text);
    throw new Error(`Gemini did not return an image. Response text: ${textPart?.text || 'none'}`);
  }

  return {
    base64: imagePart.inlineData.data,
    width: options.width || 1024,
    height: options.height || 1024,
  };
}
