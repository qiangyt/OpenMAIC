/**
 * PDF 解析提供商实现
 *
 * 工厂模式，将 PDF 解析请求路由到相应的提供商实现。
 * 遵循与 lib/ai/providers.ts 相同的架构以保持一致性。
 *
 * 当前支持的提供商：
 * - unpdf：内置 Node.js PDF 解析器，支持文本和图片提取
 * - MinerU：高级商业服务，支持 OCR、公式和表格提取
 *   (https://mineru.ai 或自托管)
 *
 * 如何添加新提供商：
 *
 * 1. 在 lib/pdf/types.ts 的 PDFProviderId 中添加提供商 ID
 *    示例：| 'tesseract-ocr'
 *
 * 2. 在 lib/pdf/constants.ts 中添加提供商配置
 *    示例：
 *    'tesseract-ocr': {
 *      id: 'tesseract-ocr',
 *      name: 'Tesseract OCR',
 *      requiresApiKey: false,
 *      icon: '/tesseract.svg',
 *      features: ['text', 'images', 'ocr']
 *    }
 *
 * 3. 在本文件中实现提供商函数
 *    模式：async function parseWithXxx(config, pdfBuffer): Promise<ParsedPdfContent>
 *    - 接受 PDF 作为 Buffer
 *    - 根据需要提取文本、图片、表格、公式
 *    - 返回统一格式：
 *      {
 *        text: string,               // Markdown 或纯文本
 *        images: string[],           // Base64 数据 URL
 *        metadata: {
 *          pageCount: number,
 *          parser: string,
 *          ...                       // 提供商特定的元数据
 *        }
 *      }
 *
 *    示例：
 *    async function parseWithTesseractOCR(
 *      config: PDFParserConfig,
 *      pdfBuffer: Buffer
 *    ): Promise<ParsedPdfContent> {
 *      const { createWorker } = await import('tesseract.js');
 *
 *      // 将 PDF 页面转换为图片
 *      const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
 *      const numPages = pdf.numPages;
 *
 *      const texts: string[] = [];
 *      const images: string[] = [];
 *
 *      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
 *        // 将页面渲染为 canvas/图片
 *        const page = await pdf.getPage(pageNum);
 *        const viewport = page.getViewport({ scale: 2.0 });
 *        const canvas = createCanvas(viewport.width, viewport.height);
 *        const context = canvas.getContext('2d');
 *        await page.render({ canvasContext: context, viewport }).promise;
 *
 *        // OCR 图片
 *        const worker = await createWorker('eng+chi_sim');
 *        const { data: { text } } = await worker.recognize(canvas.toBuffer());
 *        texts.push(text);
 *        await worker.terminate();
 *
 *        // 保存图片
 *        images.push(canvas.toDataURL());
 *      }
 *
 *      return {
 *        text: texts.join('\n\n'),
 *        images,
 *        metadata: {
 *          pageCount: numPages,
 *          parser: 'tesseract-ocr',
 *        },
 *      };
 *    }
 *
 * 4. 在 parsePDF() switch 语句中添加 case
 *    case 'tesseract-ocr':
 *      result = await parseWithTesseractOCR(config, pdfBuffer);
 *      break;
 *
 * 5. 在 lib/i18n.ts 中添加 i18n 翻译
 *    providerTesseractOCR: { zh: 'Tesseract OCR', en: 'Tesseract OCR' }
 *
 * 6. 更新 constants.ts 中的 features 以反映解析器能力
 *    features: ['text', 'images', 'ocr'] // 支持 OCR
 *
 * 提供商实现模式：
 *
 * 模式 1：本地 Node.js 解析器（如 unpdf）
 * - 导入解析库
 * - 直接处理 Buffer
 * - 同步或异步提取文本和图片
 * - 将图片转换为 base64 数据 URL
 * - 立即返回
 *
 * 模式 2：远程 API（如 MinerU）
 * - 上传 PDF 或提供 URL
 * - 创建任务并获取任务 ID
 * - 轮询完成状态（带超时）
 * - 下载结果（文本、图片、元数据）
 * - 解析并转换为统一格式
 *
 * 模式 3：基于 OCR 的解析器（Tesseract、Google Vision）
 * - 将 PDF 页面渲染为图片
 * - 将图片发送到 OCR 服务
 * - 收集所有页面的文本
 * - 如果可用，结合布局分析
 * - 返回合并的文本和原始图片
 *
 * 图片提取最佳实践：
 * - 始终转换为 base64 数据 URL (data:image/png;base64,...)
 * - 使用 PNG 以保持无损质量
 * - 使用 sharp 进行高效的图片处理
 * - 按图片处理错误（不要使整个解析失败）
 * - 记录提取失败但继续处理
 *
 * 元数据建议：
 * - pageCount：PDF 中的页数
 * - parser：提供商 ID，用于调试
 * - processingTime：耗时（自动添加）
 * - taskId/jobId：对于异步提供商（便于故障排查）
 * - 自定义字段：imageMapping、pdfImages、tables、formulas 等
 *
 * 错误处理：
 * - 如果 requiresApiKey 为 true，验证 API key
 * - 对缺少配置抛出描述性错误
 * - 对于异步提供商，处理超时和轮询错误
 * - 对非关键失败记录警告（例如单个页面错误）
 * - 始终在错误消息中包含提供商名称
 */

import { extractText, getDocumentProxy, extractImages } from 'unpdf';
import sharp from 'sharp';
import type { PDFParserConfig } from './types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { PDF_PROVIDERS } from './constants';
import { createLogger } from '@/lib/logger';

const log = createLogger('PDFProviders');

/**
 * 使用指定提供商解析 PDF
 */
export async function parsePDF(
  config: PDFParserConfig,
  pdfBuffer: Buffer,
): Promise<ParsedPdfContent> {
  const provider = PDF_PROVIDERS[config.providerId];
  if (!provider) {
    throw new Error(`Unknown PDF provider: ${config.providerId}`);
  }

  // 如果需要则验证 API key
  if (provider.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for PDF provider: ${config.providerId}`);
  }

  const startTime = Date.now();

  let result: ParsedPdfContent;

  switch (config.providerId) {
    case 'unpdf':
      result = await parseWithUnpdf(pdfBuffer);
      break;

    case 'mineru':
      result = await parseWithMinerU(config, pdfBuffer);
      break;

    default:
      throw new Error(`Unsupported PDF provider: ${config.providerId}`);
  }

  // 将处理时间添加到元数据
  if (result.metadata) {
    result.metadata.processingTime = Date.now() - startTime;
  }

  return result;
}

/**
 * 使用 unpdf 解析 PDF（现有实现）
 */
async function parseWithUnpdf(pdfBuffer: Buffer): Promise<ParsedPdfContent> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const pdf = await getDocumentProxy(uint8Array);
  const numPages = pdf.numPages;

  // 使用文档代理提取文本
  const { text: pdfText } = await extractText(pdf, {
    mergePages: true,
  });

  // 使用相同的文档代理提取图片
  const images: string[] = [];
  const pdfImagesMeta: Array<{
    id: string;
    src: string;
    pageNumber: number;
    width: number;
    height: number;
  }> = [];
  let imageCounter = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const pageImages = await extractImages(pdf, pageNum);
      for (let i = 0; i < pageImages.length; i++) {
        const imgData = pageImages[i];
        try {
          // 使用 sharp 将原始图片数据转换为 PNG base64
          const pngBuffer = await sharp(Buffer.from(imgData.data), {
            raw: {
              width: imgData.width,
              height: imgData.height,
              channels: imgData.channels,
            },
          })
            .png()
            .toBuffer();

          // 转换为 base64
          const base64 = `data:image/png;base64,${pngBuffer.toString('base64')}`;
          imageCounter++;
          const imgId = `img_${imageCounter}`;
          images.push(base64);
          pdfImagesMeta.push({
            id: imgId,
            src: base64,
            pageNumber: pageNum,
            width: imgData.width,
            height: imgData.height,
          });
        } catch (sharpError) {
          log.error(`Failed to convert image ${i + 1} from page ${pageNum}:`, sharpError);
        }
      }
    } catch (pageError) {
      log.error(`Failed to extract images from page ${pageNum}:`, pageError);
    }
  }

  return {
    text: pdfText,
    images,
    metadata: {
      pageCount: numPages,
      parser: 'unpdf',
      imageMapping: Object.fromEntries(pdfImagesMeta.map((m) => [m.id, m.src])),
      pdfImages: pdfImagesMeta,
    },
  };
}

/**
 * 使用自托管的 MinerU 服务 (mineru-api) 解析 PDF
 *
 * 官方 MinerU API 端点：
 * POST /file_parse  (multipart/form-data)
 *
 * 响应格式：
 * { results: { "document.pdf": { md_content, images, content_list, ... } } }
 *
 * @see https://github.com/opendatalab/MinerU
 */
async function parseWithMinerU(
  config: PDFParserConfig,
  pdfBuffer: Buffer,
): Promise<ParsedPdfContent> {
  if (!config.baseUrl) {
    throw new Error(
      'MinerU base URL is required. ' +
        'Please deploy MinerU locally or specify the server URL. ' +
        'See: https://github.com/opendatalab/MinerU',
    );
  }

  log.info('[MinerU] Parsing PDF with MinerU server:', config.baseUrl);

  const fileName = 'document.pdf';

  // 为文件上传创建 FormData
  const formData = new FormData();

  // 将 Buffer 转换为 Blob
  const arrayBuffer = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength,
  );
  const blob = new Blob([arrayBuffer as ArrayBuffer], {
    type: 'application/pdf',
  });
  formData.append('files', blob, fileName);

  // MinerU API 表单字段
  // 默认值已设置：return_md=true, formula_enable=true, table_enable=true
  formData.append('parse_method', 'auto');
  // hybrid-auto-engine：最佳精度，使用 VLM 进行布局理解（需要 GPU）
  // pipeline：基础模式，无 VLM，更快但图片提取质量较低
  formData.append('backend', 'hybrid-auto-engine');
  formData.append('return_content_list', 'true');
  formData.append('return_images', 'true');

  // API key（如果部署需要）
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // POST /file_parse
  const response = await fetch(`${config.baseUrl}/file_parse`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`MinerU API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();

  // 响应：{ results: { "<fileName>": { md_content, images, content_list, ... } } }
  const fileResult = json.results?.[fileName];
  if (!fileResult) {
    const keys = json.results ? Object.keys(json.results) : [];
    // 尝试第一个可用的 key，以防文件名不完全匹配
    const fallback = keys.length > 0 ? json.results[keys[0]] : null;
    if (!fallback) {
      throw new Error(`MinerU returned no results. Response keys: ${JSON.stringify(keys)}`);
    }
    log.warn(`[MinerU] Filename mismatch, using key "${keys[0]}" instead of "${fileName}"`);
    return extractMinerUResult(fallback);
  }

  return extractMinerUResult(fileResult);
}

/** 从单个 MinerU 文件结果中提取 ParsedPdfContent */
function extractMinerUResult(fileResult: Record<string, unknown>): ParsedPdfContent {
  const markdown: string = (fileResult.md_content as string) || '';
  const imageData: Record<string, string> = {};
  let pageCount = 0;

  // 从 images 对象中提取图片（key → base64 字符串）
  if (fileResult.images && typeof fileResult.images === 'object') {
    Object.entries(fileResult.images as Record<string, string>).forEach(([key, value]) => {
      imageData[key] = value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
    });
  }

  // 解析 content_list 以构建图片元数据查找表（img_path → metadata）
  const imageMetaLookup = new Map<string, { pageIdx: number; bbox: number[]; caption?: string }>();
  const contentList =
    typeof fileResult.content_list === 'string'
      ? JSON.parse(fileResult.content_list as string)
      : fileResult.content_list;
  if (Array.isArray(contentList)) {
    const pages = new Set(
      contentList
        .map((item: Record<string, unknown>) => item.page_idx)
        .filter((v: unknown) => v != null),
    );
    pageCount = pages.size;

    for (const item of contentList) {
      if (item.type === 'image' && item.img_path) {
        const metaEntry = {
          pageIdx: item.page_idx ?? 0,
          bbox: item.bbox || [0, 0, 1000, 1000],
          caption: Array.isArray(item.image_caption) ? item.image_caption[0] : undefined,
        };
        // 同时存储完整路径和基本名称，以便无论 images 字典使用 "abc.jpg" 还是 "images/abc.jpg" 都能查找
        imageMetaLookup.set(item.img_path, metaEntry);
        const basename = item.img_path.split('/').pop();
        if (basename && basename !== item.img_path) {
          imageMetaLookup.set(basename, metaEntry);
        }
      }
    }
  }

  // 构建 image 映射和 pdfImages 数组
  const imageMapping: Record<string, string> = {};
  const pdfImages: Array<{
    id: string;
    src: string;
    pageNumber: number;
    description?: string;
    width?: number;
    height?: number;
  }> = [];

  Object.entries(imageData).forEach(([key, base64Url], index) => {
    const imageId = key.startsWith('img_') ? key : `img_${index + 1}`;
    imageMapping[imageId] = base64Url;
    // 先尝试精确匹配的 key，再尝试带 'images/' 前缀（MinerU content_list 使用带前缀的路径）
    const meta = imageMetaLookup.get(key) || imageMetaLookup.get(`images/${key}`);
    pdfImages.push({
      id: imageId,
      src: base64Url,
      pageNumber: meta ? meta.pageIdx + 1 : 0,
      description: meta?.caption,
      width: meta ? meta.bbox[2] - meta.bbox[0] : undefined,
      height: meta ? meta.bbox[3] - meta.bbox[1] : undefined,
    });
  });

  const images = Object.values(imageMapping);

  log.info(
    `[MinerU] Parsed successfully: ${images.length} images, ` +
      `${markdown.length} chars of markdown`,
  );

  return {
    text: markdown,
    images,
    metadata: {
      pageCount,
      parser: 'mineru',
      imageMapping,
      pdfImages,
    },
  };
}

/**
 * 从设置 store 获取当前 PDF 解析器配置
 * 注意：此函数只能在浏览器上下文中调用
 */
export async function getCurrentPDFConfig(): Promise<PDFParserConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentPDFConfig() can only be called in browser context');
  }

  // 动态导入以避免循环依赖
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { pdfProviderId, pdfProvidersConfig } = useSettingsStore.getState();

  const providerConfig = pdfProvidersConfig?.[pdfProviderId];

  return {
    providerId: pdfProviderId,
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl,
  };
}

// 为方便使用，从 constants 重新导出
export { getAllPDFProviders, getPDFProvider } from './constants';
