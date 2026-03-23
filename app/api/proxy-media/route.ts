/**
 * 媒体代理 API
 *
 * 服务端代理，用于获取远程媒体 URL（图像/视频）。
 * 必需，因为浏览器 fetch() 到远程 CDN URL 会因 CORS 错误失败。
 * 媒体编排器使用此接口将生成的媒体下载为 blob
 * 以便 IndexedDB 持久化。
 *
 * POST /api/proxy-media
 * Body: { url: string }
 * Response: 带有适当 Content-Type 的二进制 blob
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyMedia');

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing or invalid url');
    }

    // 阻止本地/私有网络 URL 以防止 SSRF
    const ssrfError = validateUrlForSSRF(url);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    // 禁用重定向跟随以防止重定向到内部网络的攻击
    const response = await fetch(url, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      return apiError('REDIRECT_NOT_ALLOWED', 403, 'Redirects are not allowed');
    }
    if (!response.ok) {
      return apiError('UPSTREAM_ERROR', 502, `Upstream returned ${response.status}`);
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(blob.size),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    log.error('Proxy media error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
