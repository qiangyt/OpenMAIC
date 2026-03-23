/**
 * 设置 Store
 * 与 localStorage 同步的全局设置状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderId } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';
import { PROVIDERS } from '@/lib/ai/providers';
import type { TTSProviderId, ASRProviderId } from '@/lib/audio/types';
import { ASR_PROVIDERS, DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ImageProviderId, VideoProviderId } from '@/lib/media/types';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('Settings');

/** 可用的播放速度档位 */
export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface SettingsState {
  // 模型选择
  providerId: ProviderId;
  modelId: string;

  // 服务提供者配置（统一 JSON 存储）
  providersConfig: ProvidersConfig;

  // TTS 设置（旧版，保留以向后兼容）
  ttsModel: string;

  // 音频设置（新的统一音频配置）
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed: number;
  asrProviderId: ASRProviderId;
  asrLanguage: string;

  // 音频服务提供者配置
  ttsProvidersConfig: Record<
    TTSProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  asrProvidersConfig: Record<
    ASRProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  // PDF 设置
  pdfProviderId: PDFProviderId;
  pdfProvidersConfig: Record<
    PDFProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  // 图像生成设置
  imageProviderId: ImageProviderId;
  imageModelId: string;
  imageProvidersConfig: Record<
    ImageProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
      customModels?: Array<{ id: string; name: string }>;
    }
  >;

  // 视频生成设置
  videoProviderId: VideoProviderId;
  videoModelId: string;
  videoProvidersConfig: Record<
    VideoProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
      customModels?: Array<{ id: string; name: string }>;
    }
  >;

  // 媒体生成开关
  imageGenerationEnabled: boolean;
  videoGenerationEnabled: boolean;

  // 网络搜索设置
  webSearchProviderId: WebSearchProviderId;
  webSearchProvidersConfig: Record<
    WebSearchProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  // 全局 TTS/ASR 开关
  ttsEnabled: boolean;
  asrEnabled: boolean;

  // 自动配置生命周期标志（持久化）
  autoConfigApplied: boolean;

  // 播放控制
  ttsMuted: boolean;
  ttsVolume: number; // 0-1，实际音量级别
  autoPlayLecture: boolean;
  playbackSpeed: PlaybackSpeed;

  // 智能体设置
  selectedAgentIds: string[];
  maxTurns: string;
  agentMode: 'preset' | 'auto';
  autoAgentCount: number;

  // 布局偏好（通过 localStorage 持久化）
  sidebarCollapsed: boolean;
  chatAreaCollapsed: boolean;
  chatAreaWidth: number;

  // Actions
  setModel: (providerId: ProviderId, modelId: string) => void;
  setProviderConfig: (providerId: ProviderId, config: Partial<ProvidersConfig[ProviderId]>) => void;
  setProvidersConfig: (config: ProvidersConfig) => void;
  setTtsModel: (model: string) => void;
  setTTSMuted: (muted: boolean) => void;
  setTTSVolume: (volume: number) => void;
  setAutoPlayLecture: (autoPlay: boolean) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setSelectedAgentIds: (ids: string[]) => void;
  setMaxTurns: (turns: string) => void;
  setAgentMode: (mode: 'preset' | 'auto') => void;
  setAutoAgentCount: (count: number) => void;

  // 布局操作
  setSidebarCollapsed: (collapsed: boolean) => void;
  setChatAreaCollapsed: (collapsed: boolean) => void;
  setChatAreaWidth: (width: number) => void;

  // 音频操作
  setTTSProvider: (providerId: TTSProviderId) => void;
  setTTSVoice: (voice: string) => void;
  setTTSSpeed: (speed: number) => void;
  setASRProvider: (providerId: ASRProviderId) => void;
  setASRLanguage: (language: string) => void;
  setTTSProviderConfig: (
    providerId: TTSProviderId,
    config: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>,
  ) => void;
  setASRProviderConfig: (
    providerId: ASRProviderId,
    config: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>,
  ) => void;
  setTTSEnabled: (enabled: boolean) => void;
  setASREnabled: (enabled: boolean) => void;

  // PDF 操作
  setPDFProvider: (providerId: PDFProviderId) => void;
  setPDFProviderConfig: (
    providerId: PDFProviderId,
    config: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>,
  ) => void;

  // 图像生成操作
  setImageProvider: (providerId: ImageProviderId) => void;
  setImageModelId: (modelId: string) => void;
  setImageProviderConfig: (
    providerId: ImageProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      customModels: Array<{ id: string; name: string }>;
    }>,
  ) => void;

  // 视频生成操作
  setVideoProvider: (providerId: VideoProviderId) => void;
  setVideoModelId: (modelId: string) => void;
  setVideoProviderConfig: (
    providerId: VideoProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      customModels: Array<{ id: string; name: string }>;
    }>,
  ) => void;

  // 媒体生成开关操作
  setImageGenerationEnabled: (enabled: boolean) => void;
  setVideoGenerationEnabled: (enabled: boolean) => void;

  // 网络搜索操作
  setWebSearchProvider: (providerId: WebSearchProviderId) => void;
  setWebSearchProviderConfig: (
    providerId: WebSearchProviderId,
    config: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>,
  ) => void;

  // 服务端服务提供者操作
  fetchServerProviders: () => Promise<void>;
}

// 初始化默认服务提供者配置
const getDefaultProvidersConfig = (): ProvidersConfig => {
  const config: ProvidersConfig = {} as ProvidersConfig;
  Object.keys(PROVIDERS).forEach((pid) => {
    const provider = PROVIDERS[pid as ProviderId];
    config[pid as ProviderId] = {
      apiKey: '',
      baseUrl: '',
      models: provider.models,
      name: provider.name,
      type: provider.type,
      defaultBaseUrl: provider.defaultBaseUrl,
      icon: provider.icon,
      requiresApiKey: provider.requiresApiKey,
      isBuiltIn: true,
    };
  });
  return config;
};

// 初始化默认音频配置
const getDefaultAudioConfig = () => ({
  ttsProviderId: 'browser-native-tts' as TTSProviderId,
  ttsVoice: 'default',
  ttsSpeed: 1.0,
  asrProviderId: 'browser-native' as ASRProviderId,
  asrLanguage: 'zh',
  ttsProvidersConfig: {
    'openai-tts': { apiKey: '', baseUrl: '', enabled: true },
    'azure-tts': { apiKey: '', baseUrl: '', enabled: false },
    'glm-tts': { apiKey: '', baseUrl: '', enabled: false },
    'qwen-tts': { apiKey: '', baseUrl: '', enabled: false },
    'browser-native-tts': { apiKey: '', baseUrl: '', enabled: true },
  } as Record<TTSProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
  asrProvidersConfig: {
    'openai-whisper': { apiKey: '', baseUrl: '', enabled: true },
    'browser-native': { apiKey: '', baseUrl: '', enabled: true },
    'qwen-asr': { apiKey: '', baseUrl: '', enabled: false },
  } as Record<ASRProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// 初始化默认 PDF 配置
const getDefaultPDFConfig = () => ({
  pdfProviderId: 'unpdf' as PDFProviderId,
  pdfProvidersConfig: {
    unpdf: { apiKey: '', baseUrl: '', enabled: true },
    mineru: { apiKey: '', baseUrl: '', enabled: false },
  } as Record<PDFProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// 初始化默认图像配置
const getDefaultImageConfig = () => ({
  imageProviderId: 'seedream' as ImageProviderId,
  imageModelId: 'doubao-seedream-5-0-260128',
  imageProvidersConfig: {
    seedream: { apiKey: '', baseUrl: '', enabled: false },
    'qwen-image': { apiKey: '', baseUrl: '', enabled: false },
    'nano-banana': { apiKey: '', baseUrl: '', enabled: false },
  } as Record<ImageProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// 初始化默认视频配置
const getDefaultVideoConfig = () => ({
  videoProviderId: 'seedance' as VideoProviderId,
  videoModelId: 'doubao-seedance-1-5-pro-251215',
  videoProvidersConfig: {
    seedance: { apiKey: '', baseUrl: '', enabled: false },
    kling: { apiKey: '', baseUrl: '', enabled: false },
    veo: { apiKey: '', baseUrl: '', enabled: false },
    sora: { apiKey: '', baseUrl: '', enabled: false },
  } as Record<VideoProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// 初始化默认网络搜索配置
const getDefaultWebSearchConfig = () => ({
  webSearchProviderId: 'tavily' as WebSearchProviderId,
  webSearchProvidersConfig: {
    tavily: { apiKey: '', baseUrl: '', enabled: true },
  } as Record<WebSearchProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

/**
 * 确保 providersConfig 包含所有内置服务提供者及其最新模型。
 * 在每次 rehydrate 时调用（不仅仅是版本迁移），以便新添加的服务提供者
 * 总是被自动识别，无需清除缓存。
 */
function ensureBuiltInProviders(state: Partial<SettingsState>): void {
  if (!state.providersConfig) return;
  const defaultConfig = getDefaultProvidersConfig();
  Object.keys(PROVIDERS).forEach((pid) => {
    const providerId = pid as ProviderId;
    if (!state.providersConfig![providerId]) {
      // 新服务提供者：使用默认值添加
      state.providersConfig![providerId] = defaultConfig[providerId];
    } else {
      // 已有服务提供者：合并新模型和元数据
      const provider = PROVIDERS[providerId];
      const existing = state.providersConfig![providerId];

      const existingModelIds = new Set(existing.models?.map((m) => m.id) || []);
      const newModels = provider.models.filter((m) => !existingModelIds.has(m.id));
      const mergedModels =
        newModels.length > 0 ? [...newModels, ...(existing.models || [])] : existing.models;

      state.providersConfig![providerId] = {
        ...existing,
        models: mergedModels,
        name: existing.name || provider.name,
        type: existing.type || provider.type,
        defaultBaseUrl: existing.defaultBaseUrl || provider.defaultBaseUrl,
        icon: provider.icon || existing.icon,
        requiresApiKey: existing.requiresApiKey ?? provider.requiresApiKey,
        isBuiltIn: existing.isBuiltIn ?? true,
      };
    }
  });
}

// 从旧的 localStorage 格式迁移
const migrateFromOldStorage = () => {
  if (typeof window === 'undefined') return null;

  // 检查新存储是否已存在
  const newStorage = localStorage.getItem('settings-storage');
  if (newStorage) return null; // 已迁移或全新安装

  // 读取旧的 localStorage 键
  const oldLlmModel = localStorage.getItem('llmModel');
  const oldProvidersConfig = localStorage.getItem('providersConfig');
  const oldTtsModel = localStorage.getItem('ttsModel');
  const oldSelectedAgents = localStorage.getItem('selectedAgentIds');
  const oldMaxTurns = localStorage.getItem('maxTurns');

  if (!oldLlmModel && !oldProvidersConfig) return null; // 无旧数据

  // 解析模型选择
  let providerId: ProviderId = 'openai';
  let modelId = 'gpt-4o-mini';
  if (oldLlmModel) {
    const [pid, mid] = oldLlmModel.split(':');
    if (pid && mid) {
      providerId = pid as ProviderId;
      modelId = mid;
    }
  }

  // 解析服务提供者配置
  let providersConfig = getDefaultProvidersConfig();
  if (oldProvidersConfig) {
    try {
      const parsed = JSON.parse(oldProvidersConfig);
      providersConfig = { ...providersConfig, ...parsed };
    } catch (e) {
      log.error('Failed to parse old providersConfig:', e);
    }
  }

  // 解析其他设置
  let ttsModel = 'openai-tts';
  if (oldTtsModel) ttsModel = oldTtsModel;

  let selectedAgentIds = ['default-1', 'default-2', 'default-3'];
  if (oldSelectedAgents) {
    try {
      const parsed = JSON.parse(oldSelectedAgents);
      if (Array.isArray(parsed) && parsed.length > 0) {
        selectedAgentIds = parsed;
      }
    } catch (e) {
      log.error('Failed to parse old selectedAgentIds:', e);
    }
  }

  let maxTurns = '10';
  if (oldMaxTurns) maxTurns = oldMaxTurns;

  return {
    providerId,
    modelId,
    providersConfig,
    ttsModel,
    selectedAgentIds,
    maxTurns,
  };
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => {
      // 尝试从旧存储迁移
      const migratedData = migrateFromOldStorage();
      const defaultAudioConfig = getDefaultAudioConfig();
      const defaultPDFConfig = getDefaultPDFConfig();
      const defaultImageConfig = getDefaultImageConfig();
      const defaultVideoConfig = getDefaultVideoConfig();
      const defaultWebSearchConfig = getDefaultWebSearchConfig();

      return {
        // 初始状态（如有迁移数据则使用）
        providerId: migratedData?.providerId || 'openai',
        modelId: migratedData?.modelId || '',
        providersConfig: migratedData?.providersConfig || getDefaultProvidersConfig(),
        ttsModel: migratedData?.ttsModel || 'openai-tts',
        selectedAgentIds: migratedData?.selectedAgentIds || ['default-1', 'default-2', 'default-3'],
        maxTurns: migratedData?.maxTurns?.toString() || '10',
        agentMode: 'auto' as const,
        autoAgentCount: 3,

        // 播放控制
        ttsMuted: false,
        ttsVolume: 1,
        autoPlayLecture: false,
        playbackSpeed: 1,

        // 布局偏好
        sidebarCollapsed: true,
        chatAreaCollapsed: true,
        chatAreaWidth: 320,

        // 音频设置（使用默认值）
        ...defaultAudioConfig,

        // PDF 设置（使用默认值）
        ...defaultPDFConfig,

        // 图像设置（使用默认值）
        ...defaultImageConfig,

        // 视频设置（使用默认值）
        ...defaultVideoConfig,

        // 媒体生成开关（默认关闭）
        imageGenerationEnabled: false,
        videoGenerationEnabled: false,

        // 音频功能开关（默认开启）
        ttsEnabled: true,
        asrEnabled: true,

        autoConfigApplied: false,

        // 网络搜索设置（使用默认值）
        ...defaultWebSearchConfig,

        // Actions
        setModel: (providerId, modelId) => set({ providerId, modelId }),

        setProviderConfig: (providerId, config) =>
          set((state) => ({
            providersConfig: {
              ...state.providersConfig,
              [providerId]: {
                ...state.providersConfig[providerId],
                ...config,
              },
            },
          })),

        setProvidersConfig: (config) => set({ providersConfig: config }),

        setTtsModel: (model) => set({ ttsModel: model }),

        setTTSMuted: (muted) => set({ ttsMuted: muted }),

        setTTSVolume: (volume) => set({ ttsVolume: Math.max(0, Math.min(1, volume)) }),

        setAutoPlayLecture: (autoPlay) => set({ autoPlayLecture: autoPlay }),

        setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

        setSelectedAgentIds: (ids) => set({ selectedAgentIds: ids }),

        setMaxTurns: (turns) => set({ maxTurns: turns }),
        setAgentMode: (mode) => set({ agentMode: mode }),
        setAutoAgentCount: (count) => set({ autoAgentCount: count }),

        // Layout actions
        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
        setChatAreaCollapsed: (collapsed) => set({ chatAreaCollapsed: collapsed }),
        setChatAreaWidth: (width) => set({ chatAreaWidth: width }),

        // Audio actions
        setTTSProvider: (providerId) =>
          set((state) => {
            // 如果切换服务提供者，为该服务提供者设置默认语音
            const shouldUpdateVoice = state.ttsProviderId !== providerId;
            return {
              ttsProviderId: providerId,
              ...(shouldUpdateVoice && { ttsVoice: DEFAULT_TTS_VOICES[providerId] }),
            };
          }),

        setTTSVoice: (voice) => set({ ttsVoice: voice }),

        setTTSSpeed: (speed) => set({ ttsSpeed: speed }),

        // 切换服务提供者时重置语言，因为语言代码格式不同
        //（例如 browser-native 使用 BCP-47 "en-US"，OpenAI Whisper 使用 ISO 639-1 "en"）
        setASRProvider: (providerId) =>
          set((state) => {
            const supportedLanguages = ASR_PROVIDERS[providerId]?.supportedLanguages || [];
            const isLanguageValid = supportedLanguages.includes(state.asrLanguage);
            return {
              asrProviderId: providerId,
              ...(isLanguageValid ? {} : { asrLanguage: supportedLanguages[0] || 'auto' }),
            };
          }),

        setASRLanguage: (language) => set({ asrLanguage: language }),

        setTTSProviderConfig: (providerId, config) =>
          set((state) => ({
            ttsProvidersConfig: {
              ...state.ttsProvidersConfig,
              [providerId]: {
                ...state.ttsProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        setASRProviderConfig: (providerId, config) =>
          set((state) => ({
            asrProvidersConfig: {
              ...state.asrProvidersConfig,
              [providerId]: {
                ...state.asrProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // PDF actions
        setPDFProvider: (providerId) => set({ pdfProviderId: providerId }),

        setPDFProviderConfig: (providerId, config) =>
          set((state) => ({
            pdfProvidersConfig: {
              ...state.pdfProvidersConfig,
              [providerId]: {
                ...state.pdfProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // Image Generation actions
        setImageProvider: (providerId) => set({ imageProviderId: providerId }),
        setImageModelId: (modelId) => set({ imageModelId: modelId }),

        setImageProviderConfig: (providerId, config) =>
          set((state) => ({
            imageProvidersConfig: {
              ...state.imageProvidersConfig,
              [providerId]: {
                ...state.imageProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // Video Generation actions
        setVideoProvider: (providerId) => set({ videoProviderId: providerId }),
        setVideoModelId: (modelId) => set({ videoModelId: modelId }),

        setVideoProviderConfig: (providerId, config) =>
          set((state) => ({
            videoProvidersConfig: {
              ...state.videoProvidersConfig,
              [providerId]: {
                ...state.videoProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // Media generation toggle actions
        setImageGenerationEnabled: (enabled) => set({ imageGenerationEnabled: enabled }),
        setVideoGenerationEnabled: (enabled) => set({ videoGenerationEnabled: enabled }),
        setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),
        setASREnabled: (enabled) => set({ asrEnabled: enabled }),

        // Web Search actions
        setWebSearchProvider: (providerId) => set({ webSearchProviderId: providerId }),
        setWebSearchProviderConfig: (providerId, config) =>
          set((state) => ({
            webSearchProvidersConfig: {
              ...state.webSearchProvidersConfig,
              [providerId]: {
                ...state.webSearchProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // 获取服务端配置的服务提供者并合并到本地状态
        fetchServerProviders: async () => {
          try {
            const res = await fetch('/api/server-providers');
            if (!res.ok) return;
            const data = (await res.json()) as {
              providers: Record<string, { models?: string[]; baseUrl?: string }>;
              tts: Record<string, { baseUrl?: string }>;
              asr: Record<string, { baseUrl?: string }>;
              pdf: Record<string, { baseUrl?: string }>;
              image: Record<string, { baseUrl?: string }>;
              video: Record<string, { baseUrl?: string }>;
              webSearch: Record<string, { baseUrl?: string }>;
            };

            set((state) => {
              // 合并 LLM 服务提供者
              const newProvidersConfig = { ...state.providersConfig };
              // 首先重置所有服务端标志
              for (const pid of Object.keys(newProvidersConfig)) {
                const key = pid as ProviderId;
                if (newProvidersConfig[key]) {
                  newProvidersConfig[key] = {
                    ...newProvidersConfig[key],
                    isServerConfigured: false,
                    serverModels: undefined,
                    serverBaseUrl: undefined,
                  };
                }
              }
              // 设置服务端配置的服务提供者标志
              for (const [pid, info] of Object.entries(data.providers)) {
                const key = pid as ProviderId;
                if (newProvidersConfig[key]) {
                  const currentModels = newProvidersConfig[key].models;
                  // When server specifies allowed models, filter the models list
                  const filteredModels = info.models?.length
                    ? currentModels.filter((m) => info.models!.includes(m.id))
                    : currentModels;
                  newProvidersConfig[key] = {
                    ...newProvidersConfig[key],
                    isServerConfigured: true,
                    serverModels: info.models,
                    serverBaseUrl: info.baseUrl,
                    models: filteredModels,
                  };
                }
              }

              // 合并 TTS 服务提供者
              const newTTSConfig = { ...state.ttsProvidersConfig };
              for (const pid of Object.keys(newTTSConfig)) {
                const key = pid as TTSProviderId;
                if (newTTSConfig[key]) {
                  newTTSConfig[key] = {
                    ...newTTSConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.tts)) {
                const key = pid as TTSProviderId;
                if (newTTSConfig[key]) {
                  newTTSConfig[key] = {
                    ...newTTSConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // 合并 ASR 服务提供者
              const newASRConfig = { ...state.asrProvidersConfig };
              for (const pid of Object.keys(newASRConfig)) {
                const key = pid as ASRProviderId;
                if (newASRConfig[key]) {
                  newASRConfig[key] = {
                    ...newASRConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.asr)) {
                const key = pid as ASRProviderId;
                if (newASRConfig[key]) {
                  newASRConfig[key] = {
                    ...newASRConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // 合并 PDF 服务提供者
              const newPDFConfig = { ...state.pdfProvidersConfig };
              for (const pid of Object.keys(newPDFConfig)) {
                const key = pid as PDFProviderId;
                if (newPDFConfig[key]) {
                  newPDFConfig[key] = {
                    ...newPDFConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.pdf)) {
                const key = pid as PDFProviderId;
                if (newPDFConfig[key]) {
                  newPDFConfig[key] = {
                    ...newPDFConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // 合并图像服务提供者
              const newImageConfig = { ...state.imageProvidersConfig };
              for (const pid of Object.keys(newImageConfig)) {
                const key = pid as ImageProviderId;
                if (newImageConfig[key]) {
                  newImageConfig[key] = {
                    ...newImageConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.image)) {
                const key = pid as ImageProviderId;
                if (newImageConfig[key]) {
                  newImageConfig[key] = {
                    ...newImageConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // 合并视频服务提供者
              const newVideoConfig = { ...state.videoProvidersConfig };
              for (const pid of Object.keys(newVideoConfig)) {
                const key = pid as VideoProviderId;
                if (newVideoConfig[key]) {
                  newVideoConfig[key] = {
                    ...newVideoConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              if (data.video) {
                for (const [pid, info] of Object.entries(data.video)) {
                  const key = pid as VideoProviderId;
                  if (newVideoConfig[key]) {
                    newVideoConfig[key] = {
                      ...newVideoConfig[key],
                      isServerConfigured: true,
                      serverBaseUrl: info.baseUrl,
                    };
                  }
                }
              }

              // 合并网络搜索配置 — 先重置所有，再标记服务端配置的
              const newWebSearchConfig = { ...state.webSearchProvidersConfig };
              for (const key of Object.keys(newWebSearchConfig) as WebSearchProviderId[]) {
                newWebSearchConfig[key] = {
                  ...newWebSearchConfig[key],
                  isServerConfigured: false,
                  serverBaseUrl: undefined,
                };
              }
              if (data.webSearch) {
                for (const [pid, info] of Object.entries(data.webSearch)) {
                  const key = pid as WebSearchProviderId;
                  if (newWebSearchConfig[key]) {
                    newWebSearchConfig[key] = {
                      ...newWebSearchConfig[key],
                      isServerConfigured: true,
                      serverBaseUrl: info.baseUrl,
                    };
                  }
                }
              }

              // === 自动选择/自动启用（仅首次运行） ===
              let autoTtsProvider: TTSProviderId | undefined;
              let autoTtsVoice: string | undefined;
              let autoAsrProvider: ASRProviderId | undefined;
              let autoPdfProvider: PDFProviderId | undefined;
              let autoImageProvider: ImageProviderId | undefined;
              let autoImageModel: string | undefined;
              let autoVideoProvider: VideoProviderId | undefined;
              let autoVideoModel: string | undefined;
              let autoImageEnabled: boolean | undefined;
              let autoVideoEnabled: boolean | undefined;

              if (!state.autoConfigApplied) {
                // PDF：如果服务端有 mineru，则从 unpdf 切换到 mineru
                if (newPDFConfig.mineru?.isServerConfigured && state.pdfProviderId === 'unpdf') {
                  autoPdfProvider = 'mineru' as PDFProviderId;
                }

                // TTS：如果当前不是服务端配置的，选择第一个服务端服务提供者
                const serverTtsIds = Object.keys(data.tts) as TTSProviderId[];
                if (
                  serverTtsIds.length > 0 &&
                  !newTTSConfig[state.ttsProviderId]?.isServerConfigured
                ) {
                  autoTtsProvider = serverTtsIds[0];
                  autoTtsVoice = DEFAULT_TTS_VOICES[autoTtsProvider] || 'default';
                }

                // ASR：如果当前不是服务端配置的，选择第一个服务端服务提供者
                const serverAsrIds = Object.keys(data.asr) as ASRProviderId[];
                if (
                  serverAsrIds.length > 0 &&
                  !newASRConfig[state.asrProviderId]?.isServerConfigured
                ) {
                  autoAsrProvider = serverAsrIds[0];
                }

                // 图像：第一个服务端服务提供者
                const serverImageIds = Object.keys(data.image) as ImageProviderId[];
                if (
                  serverImageIds.length > 0 &&
                  !newImageConfig[state.imageProviderId]?.isServerConfigured
                ) {
                  autoImageProvider = serverImageIds[0];
                  const models = IMAGE_PROVIDERS[autoImageProvider]?.models;
                  if (models?.length) autoImageModel = models[0].id;
                }
                if (serverImageIds.length > 0 && !state.imageGenerationEnabled) {
                  autoImageEnabled = true;
                }

                // 视频：第一个服务端服务提供者
                const serverVideoIds = Object.keys(data.video || {}) as VideoProviderId[];
                if (
                  serverVideoIds.length > 0 &&
                  !newVideoConfig[state.videoProviderId]?.isServerConfigured
                ) {
                  autoVideoProvider = serverVideoIds[0];
                  const models = VIDEO_PROVIDERS[autoVideoProvider]?.models;
                  if (models?.length) autoVideoModel = models[0].id;
                }
                if (serverVideoIds.length > 0 && !state.videoGenerationEnabled) {
                  autoVideoEnabled = true;
                }
              }

              // LLM 自动选择：当 modelId 为空时
              let autoProviderId: ProviderId | undefined;
              let autoModelId: string | undefined;
              if (!state.modelId) {
                for (const [pid, cfg] of Object.entries(newProvidersConfig)) {
                  if (cfg.isServerConfigured) {
                    // 优先使用服务端限制的模型，回退到内置列表
                    const serverModels = cfg.serverModels;
                    const modelId = serverModels?.length
                      ? serverModels[0]
                      : PROVIDERS[pid as ProviderId]?.models[0]?.id;
                    if (modelId) {
                      autoProviderId = pid as ProviderId;
                      autoModelId = modelId;
                      break;
                    }
                  }
                }
              }

              return {
                providersConfig: newProvidersConfig,
                ttsProvidersConfig: newTTSConfig,
                asrProvidersConfig: newASRConfig,
                pdfProvidersConfig: newPDFConfig,
                imageProvidersConfig: newImageConfig,
                videoProvidersConfig: newVideoConfig,
                webSearchProvidersConfig: newWebSearchConfig,
                autoConfigApplied: true,
                ...(autoPdfProvider && { pdfProviderId: autoPdfProvider }),
                ...(autoTtsProvider && {
                  ttsProviderId: autoTtsProvider,
                  ttsVoice: autoTtsVoice,
                }),
                ...(autoAsrProvider && { asrProviderId: autoAsrProvider }),
                ...(autoImageProvider && {
                  imageProviderId: autoImageProvider,
                }),
                ...(autoImageModel && { imageModelId: autoImageModel }),
                ...(autoVideoProvider && {
                  videoProviderId: autoVideoProvider,
                }),
                ...(autoVideoModel && { videoModelId: autoVideoModel }),
                ...(autoImageEnabled !== undefined && {
                  imageGenerationEnabled: autoImageEnabled,
                }),
                ...(autoVideoEnabled !== undefined && {
                  videoGenerationEnabled: autoVideoEnabled,
                }),
                ...(autoProviderId && { providerId: autoProviderId }),
                ...(autoModelId && { modelId: autoModelId }),
              };
            });
          } catch (e) {
            // 静默失败 — 服务端服务提供者是可选的
            log.warn('Failed to fetch server providers:', e);
          }
        },
      };
    },
    {
      name: 'settings-storage',
      version: 2,
      // 迁移持久化状态
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<SettingsState>;

        // v0 → v1：清除硬编码的默认模型，以便用户必须主动选择
        if (version === 0) {
          if (state.providerId === 'openai' && state.modelId === 'gpt-4o-mini') {
            state.modelId = '';
          }
        }

        // 确保 providersConfig 包含所有内置服务提供者（在下面的 merge 中也会执行）
        ensureBuiltInProviders(state);

        // 从旧的 ttsModel 迁移到新的 ttsProviderId
        if (state.ttsModel && !state.ttsProviderId) {
          // 将旧的 ttsModel 值映射到新的 ttsProviderId
          if (state.ttsModel === 'openai-tts') {
            state.ttsProviderId = 'openai-tts';
          } else if (state.ttsModel === 'azure-tts') {
            state.ttsProviderId = 'azure-tts';
          } else {
            // 默认使用 OpenAI
            state.ttsProviderId = 'openai-tts';
          }
        }

        // 如果缺少则添加默认音频配置
        if (!state.ttsProvidersConfig || !state.asrProvidersConfig) {
          const defaultAudioConfig = getDefaultAudioConfig();
          Object.assign(state, defaultAudioConfig);
        }

        // 如果缺少则添加默认 PDF 配置
        if (!state.pdfProvidersConfig) {
          const defaultPDFConfig = getDefaultPDFConfig();
          Object.assign(state, defaultPDFConfig);
        }

        // 如果缺少则添加默认图像配置
        if (!state.imageProvidersConfig) {
          const defaultImageConfig = getDefaultImageConfig();
          Object.assign(state, defaultImageConfig);
        }

        // 如果缺少则添加默认视频配置
        if (!state.videoProvidersConfig) {
          const defaultVideoConfig = getDefaultVideoConfig();
          Object.assign(state, defaultVideoConfig);
        }

        // v1 → v2：用网络搜索替换深度研究
        if (version < 2) {
          delete (state as Record<string, unknown>).deepResearchProviderId;
          delete (state as Record<string, unknown>).deepResearchProvidersConfig;
        }

        // 如果缺少则添加默认媒体生成开关
        if (state.imageGenerationEnabled === undefined) {
          state.imageGenerationEnabled = false;
        }
        if (state.videoGenerationEnabled === undefined) {
          state.videoGenerationEnabled = false;
        }

        // 如果缺少则添加默认音频开关
        if ((state as Record<string, unknown>).ttsEnabled === undefined) {
          (state as Record<string, unknown>).ttsEnabled = true;
        }
        if ((state as Record<string, unknown>).asrEnabled === undefined) {
          (state as Record<string, unknown>).asrEnabled = true;
        }

        // 现有用户已完成配置 — 标记自动配置为已完成
        if ((state as Record<string, unknown>).autoConfigApplied === undefined) {
          (state as Record<string, unknown>).autoConfigApplied = true;
        }

        if ((state as Record<string, unknown>).agentMode === undefined) {
          (state as Record<string, unknown>).agentMode = 'preset';
        }
        if ((state as Record<string, unknown>).autoAgentCount === undefined) {
          (state as Record<string, unknown>).autoAgentCount = 3;
        }

        // 迁移网络搜索：旧的扁平字段 → 新的基于服务提供者的配置
        if (!state.webSearchProvidersConfig) {
          const stateRecord = state as Record<string, unknown>;
          const oldApiKey = (stateRecord.webSearchApiKey as string) || '';
          const oldIsServerConfigured =
            (stateRecord.webSearchIsServerConfigured as boolean) || false;
          state.webSearchProviderId = 'tavily' as WebSearchProviderId;
          state.webSearchProvidersConfig = {
            tavily: {
              apiKey: oldApiKey,
              baseUrl: '',
              enabled: true,
              isServerConfigured: oldIsServerConfigured,
            },
          } as SettingsState['webSearchProvidersConfig'];
          delete stateRecord.webSearchApiKey;
          delete stateRecord.webSearchIsServerConfigured;
        }

        return state;
      },
      // 自定义合并：每次 rehydrate 时始终同步内置服务提供者，
      // 以便新添加的服务提供者/模型无需清除缓存即可出现。
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as object) };
        ensureBuiltInProviders(merged as Partial<SettingsState>);
        return merged as SettingsState;
      },
    },
  ),
);
