/**
 * 图像生成 API
 *
 * 使用指定提供商从文本提示生成图像。
 * 在幻灯片生成后，由客户端在媒体生成期间调用。
 *
 * POST /api/generate/image
 *
 * Headers:
 *   x-image-provider: ImageProviderId (默认: 'seedream')
 *   x-api-key: string (可选，服务器备用)
 *   x-base-url: string (可选，服务器备用)
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { generateImage, aspectRatioToDimensions } from '@/lib/media/image-providers';
import { resolveImageApiKey, resolveImageBaseUrl } from '@/lib/server/provider-config';
import type { ImageProviderId, ImageGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('ImageGeneration API');

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImageGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId = (request.headers.get('x-image-provider') || 'seedream') as ImageProviderId;
    const clientApiKey = request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = request.headers.get('x-base-url') || undefined;
    const clientModel = request.headers.get('x-image-model') || undefined;

    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? clientApiKey || ''
      : resolveImageApiKey(providerId, clientApiKey);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        `No API key configured for image provider: ${providerId}`,
      );
    }

    const baseUrl = clientBaseUrl ? clientBaseUrl : resolveImageBaseUrl(providerId, clientBaseUrl);

    // 如果未明确设置，则根据宽高比解析尺寸
    if (!body.width && !body.height && body.aspectRatio) {
      const dims = aspectRatioToDimensions(body.aspectRatio);
      body.width = dims.width;
      body.height = dims.height;
    }

    log.info(
      `Generating image: provider=${providerId}, model=${clientModel || 'default'}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", size=${body.width ?? 'auto'}x${body.height ?? 'auto'}`,
    );

    const result = await generateImage({ providerId, apiKey, baseUrl, model: clientModel }, body);

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 检测内容安全过滤器拒绝（例如 Seedream OutputImageSensitiveContentDetected）
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Image blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, message);
    }
    log.error('Image generation error:', error);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
