export function formatContextWindow(size?: number): string {
  if (!size) return '-';

  // 对于 M：优先使用小数（对于整千使用小数）
  if (size >= 1000000) {
    if (size % 1000000 === 0) {
      return `${size / 1000000}M`;
    }
    return `${(size / 1000000).toFixed(1)}M`;
  }

  // 对于 K：如果可被 1000 整除则使用小数，否则使用二进制
  if (size >= 1000) {
    if (size % 1000 === 0) {
      return `${size / 1000}K`;
    }
    return `${Math.floor(size / 1024)}K`;
  }

  return size.toString();
}

export function getProviderTypeLabel(type: string, t: (key: string) => string): string {
  const translationKey = `settings.providerTypes.${type}`;
  const translated = t(translationKey);
  // 如果翻译存在（不等于 key），使用它；否则回退到 type
  return translated !== translationKey ? translated : type;
}
