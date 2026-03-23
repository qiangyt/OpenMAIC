/**
 * PDF 提供商常量
 * 从 pdf-providers.ts 分离出来，以避免在客户端组件中导入 sharp
 */

import type { PDFProviderId, PDFProviderConfig } from './types';

/**
 * PDF 提供商注册表
 */
export const PDF_PROVIDERS: Record<PDFProviderId, PDFProviderConfig> = {
  unpdf: {
    id: 'unpdf',
    name: 'unpdf',
    requiresApiKey: false,
    icon: '/logos/unpdf.svg',
    features: ['text', 'images', 'metadata'],
  },

  mineru: {
    id: 'mineru',
    name: 'MinerU',
    requiresApiKey: false,
    icon: '/logos/mineru.png',
    features: ['text', 'images', 'tables', 'formulas', 'layout-analysis'],
  },
};

/**
 * 获取所有可用的 PDF 提供商
 */
export function getAllPDFProviders(): PDFProviderConfig[] {
  return Object.values(PDF_PROVIDERS);
}

/**
 * 根据 ID 获取 PDF 提供商
 */
export function getPDFProvider(providerId: PDFProviderId): PDFProviderConfig | undefined {
  return PDF_PROVIDERS[providerId];
}
