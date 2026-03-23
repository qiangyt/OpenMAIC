import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { apiError, apiSuccess } from '@/lib/server/api-response';
const log = createLogger('Azure Voices');

export const maxDuration = 30;

/**
 * Azure TTS 语音列表 API
 * 从 Azure 语音服务获取可用语音列表
 */
export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseUrl } = await req.json();

    if (!apiKey) {
      return apiError('MISSING_API_KEY', 400, 'API Key is required');
    }

    if (!baseUrl) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Base URL is required');
    }

    // 验证 baseUrl 以防止 SSRF 攻击
    const ssrfError = validateUrlForSSRF(baseUrl);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    // 调用 Azure 语音列表端点；禁用重定向跟随以防止通过重定向进行 SSRF 攻击
    const response = await fetch(`${baseUrl}/cognitiveservices/voices/list`, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      return apiError('REDIRECT_NOT_ALLOWED', 403, 'Redirects are not allowed');
    }

    if (!response.ok) {
      const errorText = await response.text();
      return apiError(
        'UPSTREAM_ERROR',
        response.status,
        'Failed to fetch voices from Azure',
        errorText || response.statusText,
      );
    }

    const voices = await response.json();

    return apiSuccess({ voices });
  } catch (error) {
    log.error('API error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to fetch voices',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
