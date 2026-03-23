/**
 * 媒体（图像和视频）生成提供商类型定义
 *
 * 图像生成和视频生成的统一类型定义，
 * 采用可扩展架构以支持多个提供商。
 *
 * 当前支持的图像提供商：
 * - Seedream（字节跳动基于 SDXL 的图像生成）
 * - Qwen Image（阿里云 Wanx 图像生成）
 * - Nano Banana（通过 Banana.dev 的轻量级图像生成）
 *
 * 当前支持的视频提供商（第二阶段）：
 * - Seedance（字节跳动视频生成）
 * - Kling（快手视频生成）
 * - Veo（Google DeepMind 视频生成）
 * - Sora（OpenAI 视频生成）
 *
 * 如何添加新提供商：
 *
 * 步骤 1：将提供商 ID 添加到联合类型
 *   - 对于图像：添加到下方的 ImageProviderId
 *   - 对于视频：添加到下方的 VideoProviderId
 *
 * 步骤 2：在 constants.ts 中添加提供商配置
 *   - 定义提供商元数据（名称、图标、宽高比、风格等）
 *   - 添加到 IMAGE_PROVIDERS 或 VIDEO_PROVIDERS 注册表
 *
 * 步骤 3：在 image-providers.ts 或 video-providers.ts 中实现提供商逻辑
 *   - 在 generateImage() 或 generateVideo() switch 语句中添加 case
 *   - 为新提供商实现 API 调用逻辑
 *   - 对于异步任务型提供商，实现 MediaTaskAdapter
 *
 * 步骤 4：添加 i18n 翻译
 *   - 在 lib/i18n.ts 中添加提供商名称翻译
 *   - 格式：`provider{ProviderName}Image` 或 `provider{ProviderName}Video`
 *
 * 步骤 5（可选）：添加提供商特定选项
 *   - 根据需要扩展 ImageGenerationOptions 或 VideoGenerationOptions
 *   - 在 JSDoc 中记录提供商特定参数
 *
 * 示例：添加 DALL-E 图像提供商
 * ==================================
 * 1. 将 'dall-e' 添加到 ImageProviderId 联合类型
 * 2. 在 constants.ts 中：
 *    IMAGE_PROVIDERS['dall-e'] = {
 *      id: 'dall-e',
 *      name: 'DALL-E',
 *      requiresApiKey: true,
 *      defaultBaseUrl: 'https://api.openai.com/v1',
 *      icon: '/openai.svg',
 *      supportedAspectRatios: ['1:1', '16:9', '9:16'],
 *      supportedStyles: ['natural', 'vivid'],
 *      maxResolution: { width: 1024, height: 1024 }
 *    }
 * 3. 在 image-providers.ts 中：
 *    case 'dall-e':
 *      return await generateDallEImage(config, options);
 * 4. 在 i18n.ts 中：
 *    providerDallEImage: 'DALL-E' / 'DALL-E 图像生成'
 */

// ============================================================================
// 图像生成类型
// ============================================================================

/**
 * 图像提供商 ID
 *
 * 在此处将新的图像提供商添加为联合成员。
 * 与 constants.ts 中的 IMAGE_PROVIDERS 注册表保持同步
 */
export type ImageProviderId = 'seedream' | 'qwen-image' | 'nano-banana';
// 在下方添加新的图像提供商（取消注释并修改）：
// | 'dall-e'
// | 'midjourney'
// | 'stable-diffusion'

/**
 * 图像提供商配置
 *
 * 描述图像生成提供商的能力和元数据。
 * 用于填充 UI 控件并验证生成请求。
 */
/** 图像生成模型的元数据 */
export interface ImageModelInfo {
  /** 传递给 API 的模型标识符 */
  id: string;
  /** 人类可读的显示名称 */
  name: string;
}

export interface ImageProviderConfig {
  /** 唯一提供商标识符 */
  id: ImageProviderId;
  /** 人类可读的提供商名称 */
  name: string;
  /** 提供商是否需要 API 密钥进行认证 */
  requiresApiKey: boolean;
  /** 默认 API 基础 URL（可在用户设置中覆盖） */
  defaultBaseUrl?: string;
  /** 提供商图标资源路径 */
  icon?: string;
  /** 此提供商可用的模型 */
  models: ImageModelInfo[];
  /** 此提供商支持的宽高比 */
  supportedAspectRatios: Array<'16:9' | '4:3' | '1:1' | '9:16'>;
  /** 此提供商支持的可选艺术风格 */
  supportedStyles?: string[];
  /** 最大支持的输出分辨率 */
  maxResolution?: {
    width: number;
    height: number;
  };
}

/**
 * 图像生成配置
 *
 * 进行图像生成 API 调用的运行时配置。
 * 结合提供商选择和认证凭据。
 */
export interface ImageGenerationConfig {
  /** 要使用的图像提供商 */
  providerId: ImageProviderId;
  /** 用于认证的 API 密钥 */
  apiKey: string;
  /** 可选的提供商基础 URL 覆盖 */
  baseUrl?: string;
  /** 可选的模型 ID 覆盖（如省略则使用提供商默认值） */
  model?: string;
}

/**
 * 图像生成选项
 *
 * 单次图像生成请求的参数。
 * 与 ImageGenerationConfig 一起传递给提供商。
 */
export interface ImageGenerationOptions {
  /** 描述所需图像的文本提示词 */
  prompt: string;
  /** 可选的反向提示词，用于排除不需要的元素 */
  negativePrompt?: string;
  /** 期望的输出宽度（像素） */
  width?: number;
  /** 期望的输出高度（像素） */
  height?: number;
  /** 期望的宽高比（如未设置 width/height，提供商将计算尺寸） */
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16';
  /** 可选的艺术风格（必须被所选提供商支持） */
  style?: string;
}

/**
 * 图像生成结果
 *
 * 成功图像生成请求的输出。
 * 包含 URL 或 base64 编码的图像数据（或两者）。
 */
export interface ImageGenerationResult {
  /** 生成图像的 URL（如由提供商托管） */
  url?: string;
  /** Base64 编码的图像数据（如内联返回） */
  base64?: string;
  /** 生成图像的宽度（像素） */
  width: number;
  /** 生成图像的高度（像素） */
  height: number;
}

// ============================================================================
// 视频生成类型（第二阶段）
// ============================================================================

/**
 * 视频提供商 ID
 *
 * 在此处将新的视频提供商添加为联合成员。
 * 与 constants.ts 中的 VIDEO_PROVIDERS 注册表保持同步
 */
export type VideoProviderId = 'seedance' | 'kling' | 'veo' | 'sora';
// 在下方添加新的视频提供商（取消注释并修改）：
// | 'runway'
// | 'pika'

/**
 * 视频提供商配置
 *
 * 描述视频生成提供商的能力和元数据。
 * 用于填充 UI 控件并验证生成请求。
 */
/** 视频生成模型的元数据（与图像模型形状相同） */
export type VideoModelInfo = ImageModelInfo;

export interface VideoProviderConfig {
  /** 唯一提供商标识符 */
  id: VideoProviderId;
  /** 人类可读的提供商名称 */
  name: string;
  /** 提供商是否需要 API 密钥进行认证 */
  requiresApiKey: boolean;
  /** 默认 API 基础 URL（可在用户设置中覆盖） */
  defaultBaseUrl?: string;
  /** 提供商图标资源路径 */
  icon?: string;
  /** 此提供商可用的模型 */
  models: VideoModelInfo[];
  /** 此提供商支持的宽高比 */
  supportedAspectRatios: Array<'16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '21:9'>;
  /** 支持的视频时长（秒） */
  supportedDurations?: number[];
  /** 支持的输出分辨率 */
  supportedResolutions?: Array<'480p' | '720p' | '1080p'>;
  /** 最大视频时长（秒） */
  maxDuration?: number;
}

/**
 * 视频生成配置
 *
 * 进行视频生成 API 调用的运行时配置。
 * 结合提供商选择和认证凭据。
 */
export interface VideoGenerationConfig {
  /** 要使用的视频提供商 */
  providerId: VideoProviderId;
  /** 用于认证的 API 密钥 */
  apiKey: string;
  /** 可选的提供商基础 URL 覆盖 */
  baseUrl?: string;
  /** 可选的模型 ID 覆盖（如省略则使用提供商默认值） */
  model?: string;
}

/**
 * 视频生成选项
 *
 * 单次视频生成请求的参数。
 * 与 VideoGenerationConfig 一起传递给提供商。
 */
export interface VideoGenerationOptions {
  /** 描述所需视频的文本提示词 */
  prompt: string;
  /** 期望的视频时长（秒） */
  duration?: number;
  /** 期望的宽高比 */
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '21:9';
  /** 期望的输出分辨率 */
  resolution?: '480p' | '720p' | '1080p';
}

/**
 * 视频生成结果
 *
 * 成功视频生成请求的输出。
 * 包含生成视频的 URL 及其元数据。
 */
export interface VideoGenerationResult {
  /** 生成视频的 URL */
  url: string;
  /** 生成视频的时长（秒） */
  duration: number;
  /** 生成视频的宽度（像素） */
  width: number;
  /** 生成视频的高度（像素） */
  height: number;
  /** 可选的视频封面/缩略图 URL */
  poster?: string;
}

// ============================================================================
// 共享 / 跨领域类型
// ============================================================================

/**
 * 媒体生成请求
 *
 * 白板/画布用于请求媒体生成的统一请求类型。
 * 内部映射到图像或视频生成。
 */
export interface MediaGenerationRequest {
  /** 要生成的媒体类型 */
  type: 'image' | 'video';
  /** 描述所需媒体的文本提示词 */
  prompt: string;
  /** 画布上目标元素的标识符（如 "gen_img_1"） */
  elementId: string;
  /** 期望的宽高比 */
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16';
  /** 可选的艺术风格提示 */
  style?: string;
}

/**
 * 媒体任务适配器
 *
 * 使用异步任务模式（提交任务，然后轮询完成状态）的提供商的通用接口。
 * 许多图像/视频生成 API 是异步的 —— 此适配器抽象了这种模式。
 *
 * @template TOptions - 生成选项类型（如 ImageGenerationOptions）
 * @template TResult - 生成结果类型（如 ImageGenerationResult）
 */
export interface MediaTaskAdapter<TOptions, TResult> {
  /**
   * 向提供商提交生成任务。
   *
   * @param options - 任务的生成选项
   * @returns 可用于轮询状态的任务 ID
   */
  submitTask(options: TOptions): Promise<string>;

  /**
   * 轮询先前提交的任务状态。
   *
   * @param taskId - submitTask() 返回的任务 ID
   * @returns 如完成则返回生成结果，如仍在处理则返回 null
   */
  pollTaskStatus(taskId: string): Promise<TResult | null>;
}
