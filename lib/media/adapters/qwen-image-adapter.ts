/**
 * Qwen Image（阿里云 / DashScope）图像生成适配器
 *
 * 使用 DashScope 多模态生成 API（同步，无需轮询）。
 * 端点：https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *
 * 支持的模型：
 * - qwen-image-max（最高质量）
 * - z-image-turbo（快速，质量好）
 *
 * API 文档：https://help.aliyun.com/zh/model-studio/developer-reference/text-to-image
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'qwen-image-max';
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com';

/**
 * 将我们的 width x height 映射到 DashScope 的 size 格式 "WxH"。
 * 常用尺寸：1024*1024、1280*720、1664*928、1120*1440 等。
 */
function resolveDashScopeSize(options: ImageGenerationOptions): string {
  const w = options.width || 1024;
  const h = options.height || 576;
  return `${w}*${h}`;
}

/**
 * 轻量级连接测试 —— 通过发送最小请求验证 API 密钥。
 * 401/403 表示密钥无效；其他错误表示密钥有效。
 */
export async function testQwenImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || DEFAULT_MODEL,
          input: { messages: [{ role: 'user', content: [{ text: '' }] }] },
          parameters: { size: '1*1' },
        }),
      },
    );
    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      return {
        success: false,
        message: `Qwen Image auth failed (${response.status}): ${text}`,
      };
    }
    return { success: true, message: 'Connected to Qwen Image' };
  } catch (err) {
    return { success: false, message: `Qwen Image connectivity error: ${err}` };
  }
}

export async function generateWithQwenImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const response = await fetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                text: options.prompt,
              },
            ],
          },
        ],
      },
      parameters: {
        negative_prompt: options.negativePrompt || undefined,
        prompt_extend: true,
        watermark: false,
        size: resolveDashScopeSize(options),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen Image generation failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  // DashScope 多模态生成响应格式：
  // { output: { choices: [{ message: { content: [{ image: "url" }] } }] } }
  const choices = data.output?.choices;
  if (!choices || choices.length === 0) {
    // 检查响应中的错误
    if (data.code || data.message) {
      throw new Error(`Qwen Image error: ${data.code} - ${data.message}`);
    }
    throw new Error('Qwen Image returned empty response');
  }

  const content = choices[0]?.message?.content;
  const imageContent = content?.find((c: { image?: string }) => c.image);

  if (!imageContent?.image) {
    throw new Error('Qwen Image response missing image URL');
  }

  return {
    url: imageContent.image,
    width: options.width || 1024,
    height: options.height || 576,
  };
}
