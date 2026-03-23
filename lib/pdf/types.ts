/**
 * PDF 解析提供商类型定义
 */

/**
 * PDF 提供商 ID
 */
export type PDFProviderId = 'unpdf' | 'mineru';

/**
 * PDF 提供商配置
 */
export interface PDFProviderConfig {
  id: PDFProviderId;
  name: string;
  requiresApiKey: boolean;
  baseUrl?: string;
  icon?: string;
  features: string[]; // ['text', 'images', 'tables', 'formulas', 'layout-analysis' 等]
}

/**
 * API 调用的 PDF 解析器配置
 */
export interface PDFParserConfig {
  providerId: PDFProviderId;
  apiKey?: string;
  baseUrl?: string;
}

// 注意：ParsedPdfContent 从 @/lib/types/pdf 导入以避免重复
