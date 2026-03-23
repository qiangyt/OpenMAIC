/**
 * Seedream（字节跳动 / 豆包 / 方舟）图像生成适配器
 *
 * 使用 OpenAI 兼容的同步 API 格式。
 * 端点：https://ark.cn-beijing.volces.com/api/v3/images/generations
 *
 * 支持的模型：
 * - doubao-seedream-5-0-260128（最新 / Lite，text2img + img2img + multi-ref + group）
 * - doubao-seedream-4-5-251128
 * - doubao-seedream-4-0-250828
 * - doubao-seedream-3-0-t2i-250415
 *
 * API 文档：https://www.volcengine.com/docs/6791/1399028
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'doubao-seedream-5-0-260128';
const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com';

/**
 * 将我们的宽高比 + 尺寸映射到 Seedream 尺寸格式 "WxH"。
 * Seedream 要求最少 3,686,400 像素。
 * 常用尺寸：2048x2048 (2K)、2560x1440 (16:9)、1920x1920。
 */
function resolveSeedreamSize(options: ImageGenerationOptions): string {
  if (options.width && options.height) {
    // 确保最小像素数（3,686,400）
    const pixels = options.width * options.height;
    if (pixels < 3_686_400) {
      // 按比例放大
      const scale = Math.ceil(Math.sqrt(3_686_400 / pixels));
      return `${options.width * scale}x${options.height * scale}`;
    }
    return `${options.width}x${options.height}`;
  }
  // 默认使用 2K 以保证质量
  return '2K';
}

/**
 * 轻量级连接测试 —— 通过发送最小请求验证 API 密钥以触发认证检查。
 * 401/403 表示密钥无效。
 */
export async function testSeedreamConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  try {
    // 发送空提示词请求 —— 认证失败（401/403）表示密钥无效，
    // 任何其他错误（400）表示密钥有效但请求故意错误
    const response = await fetch(`${baseUrl}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: '',
        size: '1x1',
      }),
    });
    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      return {
        success: false,
        message: `Seedream auth failed (${response.status}): ${text}`,
      };
    }
    return { success: true, message: 'Connected to Seedream' };
  } catch (err) {
    return { success: false, message: `Seedream connectivity error: ${err}` };
  }
}

export async function generateWithSeedream(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const response = await fetch(`${baseUrl}/api/v3/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      prompt: options.prompt,
      size: resolveSeedreamSize(options),
      watermark: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Seedream generation failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  // OpenAI 兼容的响应格式：{ data: [{ url, b64_json, ... }] }
  const imageData = data.data?.[0];
  if (!imageData) {
    throw new Error('Seedream returned empty response');
  }

  return {
    url: imageData.url,
    base64: imageData.b64_json,
    width: options.width || 1024,
    height: options.height || 1024,
  };
}
