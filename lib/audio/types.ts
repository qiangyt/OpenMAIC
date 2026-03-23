/**
 * 音频提供商类型定义
 *
 * TTS（文本转语音）和 ASR（自动语音识别）的统一类型定义，
 * 采用可扩展架构以支持多个提供商。
 *
 * 当前支持的 TTS 提供商：
 * - OpenAI TTS（https://platform.openai.com/docs/guides/text-to-speech）
 * - Azure TTS（https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech）
 * - GLM TTS（https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts）
 * - Qwen TTS（https://bailian.console.aliyun.com/）
 * - 浏览器原生 TTS（Web Speech API，仅客户端）
 *
 * 当前支持的 ASR 提供商：
 * - OpenAI Whisper（https://platform.openai.com/docs/guides/speech-to-text）
 * - 浏览器原生（Web Speech API，仅客户端）
 * - Qwen ASR（DashScope API）
 *
 * 未来计划支持的提供商（可扩展）：
 * - ElevenLabs TTS/ASR（https://elevenlabs.io/docs）
 * - Fish Audio TTS（https://fish.audio/docs）
 * - Cartesia TTS（https://cartesia.ai/docs）
 * - PlayHT TTS（https://docs.play.ht/）
 * - AssemblyAI ASR（https://www.assemblyai.com/docs）
 * - Deepgram ASR（https://developers.deepgram.com/docs）
 *
 * 如何添加新提供商：
 *
 * 步骤 1：将提供商 ID 添加到联合类型
 *   - 对于 TTS：添加到下方的 TTSProviderId
 *   - 对于 ASR：添加到下方的 ASRProviderId
 *
 * 步骤 2：在 constants.ts 中添加提供商配置
 *   - 定义提供商元数据（名称、图标、语音、格式等）
 *   - 添加到 TTS_PROVIDERS 或 ASR_PROVIDERS 注册表
 *
 * 步骤 3：在 tts-providers.ts 或 asr-providers.ts 中实现提供商逻辑
 *   - 在 generateTTS() 或 transcribeAudio() switch 语句中添加 case
 *   - 为新提供商实现 API 调用逻辑
 *
 * 步骤 4：添加 i18n 翻译
 *   - 在 lib/i18n.ts 中添加提供商名称翻译
 *   - 格式：`provider{ProviderName}TTS` 或 `provider{ProviderName}ASR`
 *
 * 步骤 5（可选）：如需要，创建客户端 Hook
 *   - 对于仅浏览器提供商，创建类似 use-browser-tts.ts 的 Hook
 *   - 从 lib/hooks/ 导出
 *
 * 示例：添加 ElevenLabs TTS
 * =================================
 * 1. 将 'elevenlabs-tts' 添加到 TTSProviderId 联合类型
 * 2. 在 constants.ts 中：
 *    TTS_PROVIDERS['elevenlabs-tts'] = {
 *      id: 'elevenlabs-tts',
 *      name: 'ElevenLabs',
 *      requiresApiKey: true,
 *      defaultBaseUrl: 'https://api.elevenlabs.io/v1',
 *      icon: '/elevenlabs.svg',
 *      voices: [...],
 *      supportedFormats: ['mp3', 'pcm'],
 *      speedRange: { min: 0.5, max: 2.0, default: 1.0 }
 *    }
 * 3. 在 tts-providers.ts 中：
 *    case 'elevenlabs-tts':
 *      return await generateElevenLabsTTS(config, text);
 * 4. 在 i18n.ts 中：
 *    providerElevenLabsTTS: 'ElevenLabs TTS' / 'ElevenLabs 文本转语音'
 */

// ============================================================================
// TTS（文本转语音）类型
// ============================================================================

/**
 * TTS 提供商 ID
 *
 * 在此处将新的 TTS 提供商添加为联合成员。
 * 与 constants.ts 中的 TTS_PROVIDERS 注册表保持同步
 */
export type TTSProviderId =
  | 'openai-tts'
  | 'azure-tts'
  | 'glm-tts'
  | 'qwen-tts'
  | 'browser-native-tts';
// 在下方添加新的 TTS 提供商（取消注释并修改）：
// | 'elevenlabs-tts'
// | 'fish-audio-tts'
// | 'cartesia-tts'
// | 'playht-tts'

/**
 * TTS 语音信息
 */
export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: string;
  localeName?: string; // 语言的原生名称（如 "中文（简体，中国）"、"日本語"）
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
}

/**
 * TTS 提供商配置
 */
export interface TTSProviderConfig {
  id: TTSProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  icon?: string;
  voices: TTSVoiceInfo[];
  supportedFormats: string[]; // ['mp3', 'wav', 'opus' 等]
  speedRange?: {
    min: number;
    max: number;
    default: number;
  };
}

/**
 * API 调用的 TTS 模型配置
 */
export interface TTSModelConfig {
  providerId: TTSProviderId;
  apiKey?: string;
  baseUrl?: string;
  voice: string;
  speed?: number;
  format?: string;
}

// ============================================================================
// ASR（自动语音识别）类型
// ============================================================================

/**
 * ASR 提供商 ID
 *
 * 在此处将新的 ASR 提供商添加为联合成员。
 * 与 constants.ts 中的 ASR_PROVIDERS 注册表保持同步
 */
export type ASRProviderId = 'openai-whisper' | 'browser-native' | 'qwen-asr';
// 在下方添加新的 ASR 提供商（取消注释并修改）：
// | 'elevenlabs-asr'
// | 'assemblyai-asr'
// | 'deepgram-asr'
// | 'azure-asr'

/**
 * ASR 提供商配置
 */
export interface ASRProviderConfig {
  id: ASRProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  icon?: string;
  supportedLanguages: string[];
  supportedFormats: string[];
}

/**
 * API 调用的 ASR 模型配置
 */
export interface ASRModelConfig {
  providerId: ASRProviderId;
  apiKey?: string;
  baseUrl?: string;
  language?: string;
}
