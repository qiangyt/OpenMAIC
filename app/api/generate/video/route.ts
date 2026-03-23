/**
 * 视频生成 API
 *
 * 使用指定提供商从文本提示生成视频。
 * 使用异步任务模式（提交 → 轮询），因此 maxDuration 设置为 5 分钟。
 *
 * POST /api/generate/video
 *
 * Headers:
 *   x-video-provider: VideoProviderId (默认: 'seedance')
 *   x-video-model: string (可选模型覆盖)
 *   x-api-key: string (可选，服务器备用)
 *   x-base-url: string (可选，服务器备用)
 *
 * Body: { prompt, duration?, aspectRatio?, resolution? }
 * Response: { success: boolean, result?: VideoGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { generateVideo, normalizeVideoOptions } from '@/lib/media/video-providers';
import { resolveVideoApiKey, resolveVideoBaseUrl } from '@/lib/server/provider-config';
import type { VideoProviderId, VideoGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('VideoGeneration API');

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VideoGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId = (request.headers.get('x-video-provider') || 'seedance') as VideoProviderId;
    const clientApiKey = request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = request.headers.get('x-base-url') || undefined;
    const clientModel = request.headers.get('x-video-model') || undefined;

    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? clientApiKey || ''
      : resolveVideoApiKey(providerId, clientApiKey);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        `No API key configured for video provider: ${providerId}`,
      );
    }

    const baseUrl = clientBaseUrl ? clientBaseUrl : resolveVideoBaseUrl(providerId, clientBaseUrl);

    // 根据提供商能力规范化选项
    const options = normalizeVideoOptions(providerId, body);

    log.info(
      `Generating video: provider=${providerId}, model=${clientModel || 'default'}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", duration=${options.duration ?? 'auto'}, ` +
        `aspect=${options.aspectRatio ?? 'auto'}, resolution=${options.resolution ?? 'auto'}`,
    );

    const result = await generateVideo(
      { providerId, apiKey, baseUrl, model: clientModel },
      options,
    );

    log.info(
      `Video generated: url=${result.url ? 'yes' : 'no'}, ${result.width}x${result.height}, ${result.duration}s`,
    );

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 检测内容安全过滤器拒绝（例如 Seedance SensitiveContent 错误）
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Video blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, message);
    }
    log.error('Video generation error:', error);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
