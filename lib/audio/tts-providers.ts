/**
 * TTS（文本转语音）提供商实现
 *
 * 使用工厂模式将 TTS 请求路由到相应的提供商实现。
 * 遵循与 lib/ai/providers.ts 相同的架构以保持一致性。
 *
 * 当前支持的提供商：
 * - OpenAI TTS：https://platform.openai.com/docs/guides/text-to-speech
 * - Azure TTS：https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech
 * - GLM TTS：https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts
 * - Qwen TTS：https://bailian.console.aliyun.com/
 * - 浏览器原生：Web Speech API（仅客户端）
 *
 * 如何添加新提供商：
 *
 * 1. 在 lib/audio/types.ts 中将提供商 ID 添加到 TTSProviderId
 *    示例：| 'elevenlabs-tts'
 *
 * 2. 在 lib/audio/constants.ts 中添加提供商配置
 *    示例：
 *    'elevenlabs-tts': {
 *      id: 'elevenlabs-tts',
 *      name: 'ElevenLabs',
 *      requiresApiKey: true,
 *      defaultBaseUrl: 'https://api.elevenlabs.io/v1',
 *      icon: '/elevenlabs.svg',
 *      voices: [...],
 *      supportedFormats: ['mp3', 'pcm'],
 *      speedRange: { min: 0.5, max: 2.0, default: 1.0 }
 *    }
 *
 * 3. 在本文件中实现提供商函数
 *    模式：async function generateXxxTTS(config, text): Promise<TTSGenerationResult>
 *    - 验证配置并构建 API 请求
 *    - 处理 API 认证（apiKey、headers）
 *    - 转换提供商特定参数（voice、speed、format）
 *    - 返回 { audio: Uint8Array, format: string }
 *
 *    示例：
 *    async function generateElevenLabsTTS(
 *      config: TTSModelConfig,
 *      text: string
 *    ): Promise<TTSGenerationResult> {
 *      const baseUrl = config.baseUrl || TTS_PROVIDERS['elevenlabs-tts'].defaultBaseUrl;
 *
 *      const response = await fetch(`${baseUrl}/text-to-speech/${config.voice}`, {
 *        method: 'POST',
 *        headers: {
 *          'xi-api-key': config.apiKey!,
 *          'Content-Type': 'application/json',
 *        },
 *        body: JSON.stringify({
 *          text,
 *          model_id: 'eleven_monolingual_v1',
 *          voice_settings: {
 *            stability: 0.5,
 *            similarity_boost: 0.5,
 *          }
 *        }),
 *      });
 *
 *      if (!response.ok) {
 *        throw new Error(`ElevenLabs TTS API error: ${response.statusText}`);
 *      }
 *
 *      const arrayBuffer = await response.arrayBuffer();
 *      return {
 *        audio: new Uint8Array(arrayBuffer),
 *        format: 'mp3',
 *      };
 *    }
 *
 * 4. 在 generateTTS() switch 语句中添加 case
 *    case 'elevenlabs-tts':
 *      return await generateElevenLabsTTS(config, text);
 *
 * 5. 在 lib/i18n.ts 中添加 i18n 翻译
 *    providerElevenLabsTTS: { zh: 'ElevenLabs TTS', en: 'ElevenLabs TTS' }
 *
 * 错误处理模式：
 * - 如果 requiresApiKey 为 true，始终验证 API 密钥
 * - 为 API 失败抛出描述性错误
 * - 包含 response.statusText 或 API 返回的错误消息
 * - 对于仅客户端的提供商（browser-native），抛出错误引导使用客户端方式
 *
 * API 调用模式：
 * - 直接 API：使用 fetch 配合适当的 headers 和 body 格式（推荐，编码支持更好）
 * - SSML：用于需要 SSML 标记的 Azure 类提供商
 * - 基于 URL：用于返回音频 URL 的提供商（第二步下载）
 */

import type { TTSModelConfig } from './types';
import { TTS_PROVIDERS } from './constants';

/**
 * TTS 生成结果
 */
export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

/**
 * 使用指定的 TTS 提供商生成语音
 */
export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const provider = TTS_PROVIDERS[config.providerId];
  if (!provider) {
    throw new Error(`Unknown TTS provider: ${config.providerId}`);
  }

  // 如果需要，验证 API 密钥
  if (provider.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for TTS provider: ${config.providerId}`);
  }

  switch (config.providerId) {
    case 'openai-tts':
      return await generateOpenAITTS(config, text);

    case 'azure-tts':
      return await generateAzureTTS(config, text);

    case 'glm-tts':
      return await generateGLMTTS(config, text);

    case 'qwen-tts':
      return await generateQwenTTS(config, text);

    case 'browser-native-tts':
      throw new Error(
        'Browser Native TTS must be handled client-side using Web Speech API. This provider cannot be used on the server.',
      );

    default:
      throw new Error(`Unsupported TTS provider: ${config.providerId}`);
  }
}

/**
 * OpenAI TTS 实现（直接 API 调用，显式 UTF-8 编码）
 */
async function generateOpenAITTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['openai-tts'].defaultBaseUrl;

  // 使用 gpt-4o-mini-tts 以获得最佳质量和智能实时应用
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`OpenAI TTS API error: ${error.error?.message || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * Azure TTS 实现（直接 API 调用，使用 SSML）
 */
async function generateAzureTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['azure-tts'].defaultBaseUrl;

  // 构建 SSML
  const rate = config.speed ? `${((config.speed - 1) * 100).toFixed(0)}%` : '0%';
  const ssml = `
    <speak version='1.0' xml:lang='zh-CN'>
      <voice xml:lang='zh-CN' name='${config.voice}'>
        <prosody rate='${rate}'>${escapeXml(text)}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(`${baseUrl}/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey!,
      'Content-Type': 'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new Error(`Azure TTS API error: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * GLM TTS 实现（GLM API）
 */
async function generateGLMTTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['glm-tts'].defaultBaseUrl;

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'glm-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
      volume: 1.0,
      response_format: 'wav',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorMessage = `GLM TTS API error: ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorMessage = `GLM TTS API error: ${errorJson.error.message} (code: ${errorJson.error.code})`;
      }
    } catch {
      // 如果不是 JSON，使用原始文本
    }
    throw new Error(errorMessage);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav',
  };
}

/**
 * Qwen TTS 实现（DashScope API - Qwen3 TTS Flash）
 */
async function generateQwenTTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['qwen-tts'].defaultBaseUrl;

  // 计算语速：Qwen3 使用 rate 参数，范围 -500 到 500
  // speed 1.0 = rate 0, speed 2.0 = rate 500, speed 0.5 = rate -250
  const rate = Math.round(((config.speed || 1.0) - 1.0) * 500);

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: {
        text,
        voice: config.voice,
        language_type: 'Chinese', // 默认中文，可配置
      },
      parameters: {
        rate, // 语速，范围 -500 到 500
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Qwen TTS API error: ${errorText}`);
  }

  const data = await response.json();

  // 检查响应中的音频 URL
  if (!data.output?.audio?.url) {
    throw new Error(`Qwen TTS error: No audio URL in response. Response: ${JSON.stringify(data)}`);
  }

  // 从 URL 下载音频
  const audioUrl = data.output.audio.url;
  const audioResponse = await fetch(audioUrl);

  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio from URL: ${audioResponse.statusText}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();

  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav', // Qwen3 TTS 返回 WAV 格式
  };
}

/**
 * 从设置存储获取当前 TTS 配置
 * 注意：此函数只能在浏览器环境中调用
 */
export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  // 延迟导入以避免循环依赖
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsProviderId, ttsVoice, ttsSpeed, ttsProvidersConfig } = useSettingsStore.getState();

  const providerConfig = ttsProvidersConfig?.[ttsProviderId];

  return {
    providerId: ttsProviderId,
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl,
    voice: ttsVoice,
    speed: ttsSpeed,
  };
}

// 为方便起见，从 constants 重新导出
export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';

/**
 * 转义 SSML 中的 XML 特殊字符
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
