/**
 * PDF 解析结果类型
 * 扩展以支持 MinerU 等服务提供者的高级功能
 */

/**
 * 解析后的 PDF 内容，包含文本和图像
 */
export interface ParsedPdfContent {
  /** 从 PDF 提取的文本内容 */
  text: string;

  /** base64 数据 URL 格式的图像数组 */
  images: string[];

  /** 提取的表格（MinerU 功能） */
  tables?: Array<{
    page: number;
    data: string[][];
    caption?: string;
  }>;

  /** 提取的公式（MinerU 功能） */
  formulas?: Array<{
    page: number;
    latex: string;
    position?: { x: number; y: number; width: number; height: number };
  }>;

  /** 布局分析（MinerU 功能） */
  layout?: Array<{
    page: number;
    type: 'title' | 'text' | 'image' | 'table' | 'formula';
    content: string;
    position?: { x: number; y: number; width: number; height: number };
  }>;

  /** PDF 元数据 */
  metadata?: {
    fileName?: string;
    fileSize?: number;
    pageCount: number;
    parser?: string; // 'unpdf' | 'mineru'
    processingTime?: number;
    taskId?: string; // MinerU 任务 ID
    /** 图像 ID 到 base64 URL 的映射（用于生成流水线） */
    imageMapping?: Record<string, string>; // 例如 { "img_1": "data:image/png;base64,..." }
    /** 带页码的 PdfImage 数组（用于生成流水线） */
    pdfImages?: Array<{
      id: string;
      src: string;
      pageNumber: number;
      description?: string;
      width?: number;
      height?: number;
    }>;
    [key: string]: unknown;
  };
}

/**
 * PDF 解析请求参数
 */
export interface ParsePdfRequest {
  /** 要解析的 PDF 文件 */
  pdf: File;
}

/**
 * PDF 解析 API 响应
 */
export interface ParsePdfResponse {
  success: boolean;
  data?: ParsedPdfContent;
  error?: string;
}
