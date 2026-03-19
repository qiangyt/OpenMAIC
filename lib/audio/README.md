# 音频模块 (lib/audio/)

> TTS（语音合成）和 ASR（语音识别）的统一抽象层

## 概览

本模块实现了音频服务的统一调用接口，支持多种 TTS 和 ASR 提供商。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Audio Module                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │     TTS (语音合成)        │  │     ASR (语音识别)        │    │
│  │                          │  │                          │    │
│  │  - OpenAI TTS           │  │  - OpenAI Whisper        │    │
│  │  - Azure TTS            │  │  - Qwen ASR              │    │
│  │  - GLM TTS              │  │  - Browser Native        │    │
│  │  - Qwen TTS             │  │                          │    │
│  │  - Browser Native       │  │                          │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `tts-providers.ts` | TTS 提供者实现和路由 |
| `asr-providers.ts` | ASR 提供者实现和路由 |
| `tts-utils.ts` | TTS 工具函数（客户端） |
| `use-tts-preview.ts` | TTS 预览 Hook |
| `use-browser-asr.ts` | 浏览器 ASR Hook |
| `browser-tts-preview.ts` | 浏览器 TTS 实现 |
| `constants.ts` | 提供者配置常量 |
| `types.ts` | 类型定义 |

## TTS (语音合成)

### 支持的提供者

| Provider ID | 名称 | 输出格式 | 特点 |
|-------------|------|---------|------|
| `openai-tts` | OpenAI TTS | MP3 | 高质量、多声音 |
| `azure-tts` | Azure TTS | MP3 | SSML 支持、丰富声音 |
| `glm-tts` | GLM TTS | WAV | 中文优化 |
| `qwen-tts` | Qwen TTS | WAV | 阿里云、速度快 |
| `browser-native-tts` | 浏览器原生 | - | 无需 API、客户端运行 |

### TTS 配置

```typescript
interface TTSModelConfig {
  providerId: TTSProviderId;
  apiKey?: string;
  baseUrl?: string;
  voice: string;
  speed?: number;  // 0.5 - 2.0
}

// 提供者配置
interface TTSProviderConfig {
  id: TTSProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string;
  voices: Array<{ id: string; name: string; language: string }>;
  supportedFormats: string[];
  speedRange: { min: number; max: number; default: number };
}
```

### 使用方式（服务端）

```typescript
import { generateTTS } from '@/lib/audio/tts-providers';

const result = await generateTTS(
  {
    providerId: 'openai-tts',
    apiKey: process.env.OPENAI_API_KEY,
    voice: 'alloy',
    speed: 1.0,
  },
  '大家好，今天我们来学习光合作用。'
);

// result = { audio: Uint8Array, format: 'mp3' }
```

### OpenAI TTS 实现

```typescript
async function generateOpenAITTS(config: TTSModelConfig, text: string) {
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
    }),
  });

  const arrayBuffer = await response.arrayBuffer();
  return { audio: new Uint8Array(arrayBuffer), format: 'mp3' };
}
```

### Azure TTS (SSML)

```typescript
async function generateAzureTTS(config: TTSModelConfig, text: string) {
  // 构建 SSML
  const rate = `${((config.speed - 1) * 100).toFixed(0)}%`;
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
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'Content-Type': 'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  });

  return { audio: new Uint8Array(await response.arrayBuffer()), format: 'mp3' };
}
```

### 浏览器原生 TTS

```typescript
// 仅客户端可用
function useBrowserTTS() {
  const speak = (text: string, voice?: string, rate?: number) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice ? speechSynthesis.getVoices().find(v => v.name === voice) : null;
    utterance.rate = rate || 1.0;
    speechSynthesis.speak(utterance);
  };

  return { speak, cancel: () => speechSynthesis.cancel() };
}
```

## ASR (语音识别)

### 支持的提供者

| Provider ID | 名称 | 特点 |
|-------------|------|------|
| `openai-whisper` | OpenAI Whisper | 高精度、多语言 |
| `qwen-asr` | Qwen ASR | 中文优化、阿里云 |
| `browser-native` | 浏览器原生 | 无需 API、客户端运行 |

### ASR 配置

```typescript
interface ASRModelConfig {
  providerId: ASRProviderId;
  apiKey?: string;
  baseUrl?: string;
  language: string;  // 'zh', 'en', 'auto'
}

interface ASRTranscriptionResult {
  text: string;
}
```

### 使用方式（服务端）

```typescript
import { transcribeAudio } from '@/lib/audio/asr-providers';

const result = await transcribeAudio(
  {
    providerId: 'openai-whisper',
    apiKey: process.env.OPENAI_API_KEY,
    language: 'zh',
  },
  audioBuffer  // Buffer | Blob
);

// result = { text: '转录的文本内容' }
```

### OpenAI Whisper 实现

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';

async function transcribeOpenAIWhisper(config: ASRModelConfig, audioBuffer: Buffer | Blob) {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  // 转换音频格式
  let audioData: Buffer | Uint8Array;
  if (audioBuffer instanceof Blob) {
    audioData = new Uint8Array(await audioBuffer.arrayBuffer());
  } else {
    audioData = audioBuffer;
  }

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
}
```

### Qwen ASR 实现

```typescript
async function transcribeQwenASR(config: ASRModelConfig, audioBuffer: Buffer | Blob) {
  // 转换为 base64
  const base64Audio = audioBuffer instanceof Buffer
    ? audioBuffer.toString('base64')
    : Buffer.from(await audioBuffer.arrayBuffer()).toString('base64');

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-DashScope-Audio-Format': 'wav',
    },
    body: JSON.stringify({
      model: 'qwen3-asr-flash',
      input: {
        messages: [{
          role: 'user',
          content: [{ audio: `data:audio/wav;base64,${base64Audio}` }],
        }],
      },
      parameters: config.language !== 'auto' ? { asr_options: { language: config.language } } : undefined,
    }),
  });

  const data = await response.json();
  return { text: data.output.choices[0].message.content[0].text || '' };
}
```

## 添加新提供者

### TTS 添加步骤

1. **在 `lib/audio/types.ts` 添加类型**
   ```typescript
   type TTSProviderId = ... | 'elevenlabs-tts';
   ```

2. **在 `lib/audio/constants.ts` 添加配置**
   ```typescript
   'elevenlabs-tts': {
     id: 'elevenlabs-tts',
     name: 'ElevenLabs',
     requiresApiKey: true,
     defaultBaseUrl: 'https://api.elevenlabs.io/v1',
     voices: [...],
     supportedFormats: ['mp3'],
     speedRange: { min: 0.5, max: 2.0, default: 1.0 },
   }
   ```

3. **在 `tts-providers.ts` 实现函数**
   ```typescript
   async function generateElevenLabsTTS(config: TTSModelConfig, text: string) {
     // 实现调用逻辑
   }

   // 添加到 switch
   case 'elevenlabs-tts':
     return await generateElevenLabsTTS(config, text);
   ```

### ASR 添加步骤

类似 TTS，参考 `asr-providers.ts` 中的详细注释。

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/audio/                               │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/store/settings.ts (提供者配置)                           │
│  - lib/audio/types.ts (类型定义)                                │
│  - lib/audio/constants.ts (提供者常量)                          │
│  - ai (Vercel AI SDK - Whisper)                                │
│                                                                 │
│  被依赖:                                                        │
│  - app/api/audio/tts/route.ts                                  │
│  - app/api/audio/asr/route.ts                                  │
│  - lib/playback/engine.ts (播放 TTS)                            │
│  - components/ (语音输入/预览)                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么 TTS 返回 Uint8Array 而非 URL？

1. **统一处理**: 无论 API 返回 URL 还是 base64，统一转换为二进制
2. **存储友好**: 直接存储到 IndexedDB
3. **播放灵活**: 可以创建 Blob URL 或直接播放

### 为什么 Browser Native 不能在服务端使用？

1. **API 限制**: Web Speech API 只在浏览器中可用
2. **明确错误**: 抛出明确错误指导开发者使用客户端 Hook
3. **架构清晰**: 服务端/客户端职责分离

### 为什么 Qwen ASR 使用 base64 而非 FormData？

1. **API 设计**: DashScope API 要求 JSON + base64 格式
2. **一致性**: 与 Qwen TTS 使用相同的认证方式
3. **兼容性**: base64 在所有环境中可靠工作
