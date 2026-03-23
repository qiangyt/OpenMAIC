/**
 * ASR（自动语音识别）提供商实现
 *
 * 使用工厂模式将 ASR 请求路由到相应的提供商实现。
 * 遵循与 lib/ai/providers.ts 相同的架构以保持一致性。
 *
 * 当前支持的提供商：
 * - OpenAI Whisper：https://platform.openai.com/docs/guides/speech-to-text
 * - 浏览器原生：Web Speech API（https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API）
 * - Qwen ASR：https://bailian.console.aliyun.com/
 *
 * 如何添加新提供商：
 *
 * 1. 在 lib/audio/types.ts 中将提供商 ID 添加到 ASRProviderId
 *    示例：| 'assemblyai-asr'
 *
 * 2. 在 lib/audio/constants.ts 中添加提供商配置
 *    示例：
 *    'assemblyai-asr': {
 *      id: 'assemblyai-asr',
 *      name: 'AssemblyAI',
 *      requiresApiKey: true,
 *      defaultBaseUrl: 'https://api.assemblyai.com/v2',
 *      icon: '/assemblyai.svg',
 *      supportedLanguages: ['en', 'es', 'fr', 'de', 'auto'],
 *      supportedFormats: ['mp3', 'wav', 'flac', 'm4a']
 *    }
 *
 * 3. 在本文件中实现提供商函数
 *    模式：async function transcribeXxxASR(config, audioBuffer): Promise<ASRTranscriptionResult>
 *    - 处理 Buffer/Blob 转换（见下方的辅助模式）
 *    - 使用音频数据构建 API 请求（FormData 或 base64）
 *    - 处理 API 认证（apiKey、headers）
 *    - 如需要，转换语言代码
 *    - 返回 { text: string }
 *
 *    示例：
 *    async function transcribeAssemblyAIASR(
 *      config: ASRModelConfig,
 *      audioBuffer: Buffer | Blob
 *    ): Promise<ASRTranscriptionResult> {
 *      const baseUrl = config.baseUrl || ASR_PROVIDERS['assemblyai-asr'].defaultBaseUrl;
 *
 *      // 步骤 1：上传音频文件
 *      let blob: Blob;
 *      if (audioBuffer instanceof Buffer) {
 *        blob = new Blob([audioBuffer.buffer.slice(
 *          audioBuffer.byteOffset,
 *          audioBuffer.byteOffset + audioBuffer.byteLength
 *        ) as ArrayBuffer], { type: 'audio/webm' });
 *      } else {
 *        blob = audioBuffer;
 *      }
 *
 *      const uploadResponse = await fetch(`${baseUrl}/upload`, {
 *        method: 'POST',
 *        headers: {
 *          'authorization': config.apiKey!,
 *        },
 *        body: blob,
 *      });
 *
 *      if (!uploadResponse.ok) {
 *        throw new Error(`AssemblyAI upload error: ${uploadResponse.statusText}`);
 *      }
 *
 *      const { upload_url } = await uploadResponse.json();
 *
 *      // 步骤 2：请求转录
 *      const transcriptResponse = await fetch(`${baseUrl}/transcript`, {
 *        method: 'POST',
 *        headers: {
 *          'authorization': config.apiKey!,
 *          'Content-Type': 'application/json',
 *        },
 *        body: JSON.stringify({
 *          audio_url: upload_url,
 *          language_code: config.language === 'auto' ? undefined : config.language,
 *        }),
 *      });
 *
 *      const { id } = await transcriptResponse.json();
 *
 *      // 步骤 3：轮询完成状态
 *      while (true) {
 *        const statusResponse = await fetch(`${baseUrl}/transcript/${id}`, {
 *          headers: { 'authorization': config.apiKey! },
 *        });
 *        const result = await statusResponse.json();
 *
 *        if (result.status === 'completed') {
 *          return { text: result.text || '' };
 *        } else if (result.status === 'error') {
 *          throw new Error(`AssemblyAI error: ${result.error}`);
 *        }
 *
 *        await new Promise(resolve => setTimeout(resolve, 1000));
 *      }
 *    }
 *
 * 4. 在 transcribeAudio() switch 语句中添加 case
 *    case 'assemblyai-asr':
 *      return await transcribeAssemblyAIASR(config, audioBuffer);
 *
 * 5. 在 lib/i18n.ts 中添加 i18n 翻译
 *    providerAssemblyAIASR: { zh: 'AssemblyAI 语音识别', en: 'AssemblyAI ASR' }
 *
 * Buffer/Blob 转换模式：
 *
 * 模式 1：Buffer 转 Blob（用于 FormData）
 *   const blob = new Blob([
 *     audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer
 *   ], { type: 'audio/webm' });
 *
 * 模式 2：Buffer 转 base64（用于 JSON API）
 *   let base64Audio: string;
 *   if (audioBuffer instanceof Buffer) {
 *     base64Audio = audioBuffer.toString('base64');
 *   } else {
 *     const arrayBuffer = await audioBuffer.arrayBuffer();
 *     base64Audio = Buffer.from(arrayBuffer).toString('base64');
 *   }
 *
 * 模式 3：Buffer/Blob 转 File（用于 Vercel AI SDK）
 *   let audioFile: File;
 *   if (audioBuffer instanceof Buffer) {
 *     const arrayBuffer = audioBuffer.buffer.slice(...) as ArrayBuffer;
 *     const blob = new Blob([arrayBuffer], { type: 'audio/webm' });
 *     audioFile = new File([blob], 'audio.webm', { type: 'audio/webm' });
 *   } else {
 *     audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
 *   }
 *
 * 错误处理模式：
 * - 如果 requiresApiKey 为 true，始终验证 API 密钥
 * - 为 API 失败抛出描述性错误
 * - 包含 response.statusText 或 API 返回的错误消息
 * - 对于仅客户端的提供商（browser-native），抛出错误引导使用客户端方式
 * - 使用适当的超时和错误检查处理轮询/异步 API
 *
 * API 调用模式：
 * - Vercel AI SDK：使用 createOpenAI + transcribe（OpenAI、兼容提供商）
 * - FormData：用于期望 multipart/form-data 的提供商（大多数提供商）
 * - Base64：用于期望 JSON 带 base64 音频的提供商（Qwen、DashScope）
 * - 上传 + 轮询：用于异步提供商（AssemblyAI、Deepgram batch）
 */

import { createOpenAI } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import type { ASRModelConfig } from './types';
import { ASR_PROVIDERS } from './constants';

/**
 * ASR 转录结果
 */
export interface ASRTranscriptionResult {
  text: string;
}

/**
 * 使用指定的 ASR 提供商转录音频
 */
export async function transcribeAudio(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const provider = ASR_PROVIDERS[config.providerId];
  if (!provider) {
    throw new Error(`Unknown ASR provider: ${config.providerId}`);
  }

  // 如果需要，验证 API 密钥
  if (provider.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for ASR provider: ${config.providerId}`);
  }

  switch (config.providerId) {
    case 'openai-whisper':
      return await transcribeOpenAIWhisper(config, audioBuffer);

    case 'browser-native':
      throw new Error('Browser Native ASR must be handled client-side using useBrowserASR hook');

    case 'qwen-asr':
      return await transcribeQwenASR(config, audioBuffer);

    default:
      throw new Error(`Unsupported ASR provider: ${config.providerId}`);
  }
}

/**
 * OpenAI Whisper 实现（使用 Vercel AI SDK）
 */
async function transcribeOpenAIWhisper(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const openai = createOpenAI({
    apiKey: config.apiKey!,
    baseURL: config.baseUrl || ASR_PROVIDERS['openai-whisper'].defaultBaseUrl,
  });

  // 转换为 Buffer 或 Uint8Array（AI SDK 要求）
  let audioData: Buffer | Uint8Array;
  if (audioBuffer instanceof Buffer) {
    audioData = audioBuffer;
  } else if (audioBuffer instanceof Blob) {
    const arrayBuffer = await audioBuffer.arrayBuffer();
    audioData = new Uint8Array(arrayBuffer);
  } else {
    throw new Error('Invalid audio buffer type');
  }

  try {
    const result = await transcribe({
      model: openai.transcription('gpt-4o-mini-transcribe'),
      audio: audioData,
      providerOptions: {
        openai: {
          language: config.language === 'auto' ? undefined : config.language,
        },
      },
    });

    return { text: result.text || '' };
  } catch (error: unknown) {
    // 短/静音音频可能导致 SDK 抛出异常 —— 视为空转录
    const errMsg = error instanceof Error ? error.message : '';
    if (errMsg.includes('empty') || errMsg.includes('too short')) {
      return { text: '' };
    }
    throw error;
  }
}

/**
 * Qwen ASR 实现（DashScope API - Qwen3 ASR Flash）
 */
async function transcribeQwenASR(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const baseUrl = config.baseUrl || ASR_PROVIDERS['qwen-asr'].defaultBaseUrl;

  // 将音频转换为 base64
  let base64Audio: string;
  if (audioBuffer instanceof Buffer) {
    base64Audio = audioBuffer.toString('base64');
  } else if (audioBuffer instanceof Blob) {
    const arrayBuffer = await audioBuffer.arrayBuffer();
    base64Audio = Buffer.from(arrayBuffer).toString('base64');
  } else {
    throw new Error('Invalid audio buffer type');
  }

  // 构建请求体
  const requestBody: Record<string, unknown> = {
    model: 'qwen3-asr-flash',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              audio: `data:audio/wav;base64,${base64Audio}`,
            },
          ],
        },
      ],
    },
  };

  // 如果指定了语言，在 asr_options 中添加语言参数（可选 - 可提高已知语言的准确率）
  // 如果语言不确定或混合，不指定（自动检测）
  if (config.language && config.language !== 'auto') {
    requestBody.parameters = {
      asr_options: {
        language: config.language,
      },
    };
  }

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-DashScope-Audio-Format': 'wav',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    // "The audio is empty" —— 视为未检测到语音
    if (errorText.includes('audio is empty') || errorText.includes('InvalidParameter')) {
      return { text: '' };
    }
    throw new Error(`Qwen ASR API error: ${errorText}`);
  }

  const data = await response.json();

  // 检查响应中的转录结果
  // Qwen3 ASR 返回 OpenAI 兼容格式：
  // { output: { choices: [{ message: { content: [{ text: "转录文本" }] } }] } }
  if (
    !data.output?.choices ||
    !Array.isArray(data.output.choices) ||
    data.output.choices.length === 0
  ) {
    throw new Error(`Qwen ASR error: No choices in response. Response: ${JSON.stringify(data)}`);
  }

  const firstChoice = data.output.choices[0];
  const messageContent = firstChoice?.message?.content;

  if (!Array.isArray(messageContent) || messageContent.length === 0) {
    // 空内容通常意味着音频太短或不包含语音
    return { text: '' };
  }

  // 从第一个内容项提取文本
  const transcribedText = messageContent[0]?.text || '';
  return { text: transcribedText };
}

/**
 * 从设置存储获取当前 ASR 配置
 * 注意：此函数只能在浏览器环境中调用
 */
export async function getCurrentASRConfig(): Promise<ASRModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentASRConfig() can only be called in browser context');
  }

  // 延迟导入以避免循环依赖
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { asrProviderId, asrLanguage, asrProvidersConfig } = useSettingsStore.getState();

  const providerConfig = asrProvidersConfig?.[asrProviderId];

  return {
    providerId: asrProviderId,
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl,
    language: asrLanguage,
  };
}

// 为方便起见，从 constants 重新导出
export { getAllASRProviders, getASRProvider, getASRSupportedLanguages } from './constants';
