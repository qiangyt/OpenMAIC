/**
 * SSRF（服务端请求伪造）防护工具。
 *
 * 验证 URL 以防止请求内部/私有网络地址。
 * 供任何在服务端获取用户提供的 URL 的 API 路由使用。
 */

/** 检查主机名是否在 172.16.0.0 - 172.31.255.255 私有地址范围内 */
function isPrivate172(hostname: string): boolean {
  if (!hostname.startsWith('172.')) return false;
  const second = parseInt(hostname.split('.')[1], 10);
  return second >= 16 && second <= 31;
}

/**
 * 验证 URL 以防止 SSRF 攻击。
 * 如果 URL 安全则返回 null，如果被阻止则返回错误信息字符串。
 */
export function validateUrlForSSRF(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only HTTP(S) URLs are allowed';
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.') ||
    isPrivate172(hostname) ||
    hostname.endsWith('.local') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('fe80')
  ) {
    return 'Local/private network URLs are not allowed';
  }

  return null;
}
