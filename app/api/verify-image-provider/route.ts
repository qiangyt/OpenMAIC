/**
 * 图像服务提供商验证 API
 *
 * 轻量级端点，用于验证服务提供商凭证但不生成图像。
 *
 * POST /api/verify-image-provider
 *
 * Headers:
 *   x-image-provider: ImageProviderId
 *   x-image-model: string (可选)
 *   x-api-key: string (可选，服务器备用)
 *   x-base-url: string (可选，服务器备用)
 *
 * Response: { success: boolean, message: string }
 */

import { NextRequest } from 'next/server';
import { testImageConnectivity } from '@/lib/media/image-providers';
import { resolveImageApiKey, resolveImageBaseUrl } from '@/lib/server/provider-config';
import type { ImageProviderId } from '@/lib/media/types';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('VerifyImageProvider');

export async function POST(request: NextRequest) {
  try {
    const providerId = (request.headers.get('x-image-provider') || 'seedream') as ImageProviderId;
    const model = request.headers.get('x-image-model') || undefined;
    const clientApiKey = request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = request.headers.get('x-base-url') || undefined;

    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? clientApiKey || ''
      : resolveImageApiKey(providerId, clientApiKey);
    const baseUrl = clientBaseUrl ? clientBaseUrl : resolveImageBaseUrl(providerId, clientBaseUrl);

    if (!apiKey) {
      return apiError('MISSING_API_KEY', 400, 'No API key configured');
    }

    const result = await testImageConnectivity({
      providerId,
      apiKey,
      baseUrl,
      model,
    });

    if (!result.success) {
      return apiError('UPSTREAM_ERROR', 500, result.message);
    }

    return apiSuccess({ message: result.message });
  } catch (err) {
    log.error('Connectivity test error:', err);
    return apiError('INTERNAL_ERROR', 500, `Connectivity test error: ${err}`);
  }
}
