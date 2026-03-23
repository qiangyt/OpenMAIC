/**
 * 音频提供商常量
 *
 * 所有 TTS 和 ASR 提供商及其元数据的注册表。
 * 与 tts-providers.ts 和 asr-providers.ts 分离，以避免在客户端组件中导入
 * Node.js 库（如 sharp、buffer）。
 *
 * 此文件对客户端安全，可在客户端和服务器端组件中导入。
 *
 * 添加新提供商：
 * 1. 在 types.ts 中将提供商 ID 添加到 TTSProviderId 或 ASRProviderId
 * 2. 在下方的 TTS_PROVIDERS 或 ASR_PROVIDERS 中添加提供商配置
 * 3. 在 tts-providers.ts 或 asr-providers.ts 中实现提供商逻辑
 * 4. 在 lib/i18n.ts 中添加 i18n 翻译
 *
 * 提供商配置应包含：
 * - id：与类型定义匹配的唯一标识符
 * - name：提供商的显示名称
 * - requiresApiKey：提供商是否需要 API 密钥
 * - defaultBaseUrl：默认 API 端点（可选）
 * - icon：提供商图标路径（可选）
 * - voices：可用语音数组（仅 TTS）
 * - supportedFormats：提供商支持的音频格式
 * - speedRange：最小/最大/默认语速设置（仅 TTS）
 * - supportedLanguages：提供商支持的语言（仅 ASR）
 */

import type {
  TTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  ASRProviderId,
  ASRProviderConfig,
} from './types';

/**
 * TTS 提供商注册表
 *
 * 所有 TTS 提供商的中央注册表。
 * 与 TTSProviderId 类型定义保持同步。
 */
export const TTS_PROVIDERS: Record<TTSProviderId, TTSProviderConfig> = {
  'openai-tts': {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '/logos/openai.svg',
    voices: [
      // 推荐语音（最佳质量）
      {
        id: 'marin',
        name: 'Marin',
        language: 'en',
        gender: 'neutral',
        description: 'voiceMarin',
      },
      {
        id: 'cedar',
        name: 'Cedar',
        language: 'en',
        gender: 'neutral',
        description: 'voiceCedar',
      },
      // 标准语音（按字母排序）
      {
        id: 'alloy',
        name: 'Alloy',
        language: 'en',
        gender: 'neutral',
        description: 'voiceAlloy',
      },
      {
        id: 'ash',
        name: 'Ash',
        language: 'en',
        gender: 'neutral',
        description: 'voiceAsh',
      },
      {
        id: 'ballad',
        name: 'Ballad',
        language: 'en',
        gender: 'neutral',
        description: 'voiceBallad',
      },
      {
        id: 'coral',
        name: 'Coral',
        language: 'en',
        gender: 'neutral',
        description: 'voiceCoral',
      },
      {
        id: 'echo',
        name: 'Echo',
        language: 'en',
        gender: 'male',
        description: 'voiceEcho',
      },
      {
        id: 'fable',
        name: 'Fable',
        language: 'en',
        gender: 'neutral',
        description: 'voiceFable',
      },
      {
        id: 'nova',
        name: 'Nova',
        language: 'en',
        gender: 'female',
        description: 'voiceNova',
      },
      {
        id: 'onyx',
        name: 'Onyx',
        language: 'en',
        gender: 'male',
        description: 'voiceOnyx',
      },
      {
        id: 'sage',
        name: 'Sage',
        language: 'en',
        gender: 'neutral',
        description: 'voiceSage',
      },
      {
        id: 'shimmer',
        name: 'Shimmer',
        language: 'en',
        gender: 'female',
        description: 'voiceShimmer',
      },
      {
        id: 'verse',
        name: 'Verse',
        language: 'en',
        gender: 'neutral',
        description: 'voiceVerse',
      },
    ],
    supportedFormats: ['mp3', 'opus', 'aac', 'flac'],
    speedRange: { min: 0.25, max: 4.0, default: 1.0 },
  },

  'azure-tts': {
    id: 'azure-tts',
    name: 'Azure TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://{region}.tts.speech.microsoft.com',
    icon: '/logos/azure.svg',
    voices: [
      {
        id: 'zh-CN-XiaoxiaoNeural',
        name: '晓晓 (女)',
        language: 'zh-CN',
        gender: 'female',
      },
      {
        id: 'zh-CN-YunxiNeural',
        name: '云希 (男)',
        language: 'zh-CN',
        gender: 'male',
      },
      {
        id: 'zh-CN-XiaoyiNeural',
        name: '晓伊 (女)',
        language: 'zh-CN',
        gender: 'female',
      },
      {
        id: 'zh-CN-YunjianNeural',
        name: '云健 (男)',
        language: 'zh-CN',
        gender: 'male',
      },
      {
        id: 'en-US-JennyNeural',
        name: 'Jenny',
        language: 'en-US',
        gender: 'female',
      },
      { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US', gender: 'male' },
    ],
    supportedFormats: ['mp3', 'wav', 'ogg'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'glm-tts': {
    id: 'glm-tts',
    name: 'GLM TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    icon: '/logos/glm.svg',
    voices: [
      {
        id: 'tongtong',
        name: '彤彤',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceTongtong',
      },
      {
        id: 'chuichui',
        name: '锤锤',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceChuichui',
      },
      {
        id: 'xiaochen',
        name: '小陈',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceXiaochen',
      },
      {
        id: 'jam',
        name: 'Jam',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceJam',
      },
      {
        id: 'kazi',
        name: 'Kazi',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceKazi',
      },
      {
        id: 'douji',
        name: '豆几',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceDouji',
      },
      {
        id: 'luodo',
        name: '罗多',
        language: 'zh',
        gender: 'neutral',
        description: 'glmVoiceLuodo',
      },
    ],
    supportedFormats: ['wav'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'qwen-tts': {
    id: 'qwen-tts',
    name: 'Qwen TTS (阿里云百炼)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    icon: '/logos/bailian.svg',
    voices: [
      // 标准普通话语音
      {
        id: 'Cherry',
        name: '芊悦 (Cherry)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceCherry',
      },
      {
        id: 'Serena',
        name: '苏瑶 (Serena)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceSerena',
      },
      {
        id: 'Ethan',
        name: '晨煦 (Ethan)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceEthan',
      },
      {
        id: 'Chelsie',
        name: '千雪 (Chelsie)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceChelsie',
      },
      {
        id: 'Momo',
        name: '茉兔 (Momo)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceMomo',
      },
      {
        id: 'Vivian',
        name: '十三 (Vivian)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceVivian',
      },
      {
        id: 'Moon',
        name: '月白 (Moon)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceMoon',
      },
      {
        id: 'Maia',
        name: '四月 (Maia)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceMaia',
      },
      {
        id: 'Kai',
        name: '凯 (Kai)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceKai',
      },
      {
        id: 'Nofish',
        name: '不吃鱼 (Nofish)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceNofish',
      },
      {
        id: 'Bella',
        name: '萌宝 (Bella)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceBella',
      },
      {
        id: 'Jennifer',
        name: '詹妮弗 (Jennifer)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceJennifer',
      },
      {
        id: 'Ryan',
        name: '甜茶 (Ryan)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceRyan',
      },
      {
        id: 'Katerina',
        name: '卡捷琳娜 (Katerina)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceKaterina',
      },
      {
        id: 'Aiden',
        name: '艾登 (Aiden)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceAiden',
      },
      {
        id: 'Eldric Sage',
        name: '沧明子 (Eldric Sage)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceEldricSage',
      },
      {
        id: 'Mia',
        name: '乖小妹 (Mia)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceMia',
      },
      {
        id: 'Mochi',
        name: '沙小弥 (Mochi)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceMochi',
      },
      {
        id: 'Bellona',
        name: '燕铮莺 (Bellona)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceBellona',
      },
      {
        id: 'Vincent',
        name: '田叔 (Vincent)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceVincent',
      },
      {
        id: 'Bunny',
        name: '萌小姬 (Bunny)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceBunny',
      },
      {
        id: 'Neil',
        name: '阿闻 (Neil)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceNeil',
      },
      {
        id: 'Elias',
        name: '墨讲师 (Elias)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceElias',
      },
      {
        id: 'Arthur',
        name: '徐大爷 (Arthur)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceArthur',
      },
      {
        id: 'Nini',
        name: '邻家妹妹 (Nini)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceNini',
      },
      {
        id: 'Ebona',
        name: '诡婆婆 (Ebona)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceEbona',
      },
      {
        id: 'Seren',
        name: '小婉 (Seren)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceSeren',
      },
      {
        id: 'Pip',
        name: '顽屁小孩 (Pip)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoicePip',
      },
      {
        id: 'Stella',
        name: '少女阿月 (Stella)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceStella',
      },
      // 国际语音
      {
        id: 'Bodega',
        name: '博德加 (Bodega)',
        language: 'es',
        gender: 'male',
        description: 'qwenVoiceBodega',
      },
      {
        id: 'Sonrisa',
        name: '索尼莎 (Sonrisa)',
        language: 'es',
        gender: 'female',
        description: 'qwenVoiceSonrisa',
      },
      {
        id: 'Alek',
        name: '阿列克 (Alek)',
        language: 'ru',
        gender: 'male',
        description: 'qwenVoiceAlek',
      },
      {
        id: 'Dolce',
        name: '多尔切 (Dolce)',
        language: 'it',
        gender: 'male',
        description: 'qwenVoiceDolce',
      },
      {
        id: 'Sohee',
        name: '素熙 (Sohee)',
        language: 'ko',
        gender: 'female',
        description: 'qwenVoiceSohee',
      },
      {
        id: 'Ono Anna',
        name: '小野杏 (Ono Anna)',
        language: 'ja',
        gender: 'female',
        description: 'qwenVoiceOnoAnna',
      },
      {
        id: 'Lenn',
        name: '莱恩 (Lenn)',
        language: 'de',
        gender: 'male',
        description: 'qwenVoiceLenn',
      },
      {
        id: 'Emilien',
        name: '埃米尔安 (Emilien)',
        language: 'fr',
        gender: 'male',
        description: 'qwenVoiceEmilien',
      },
      {
        id: 'Andre',
        name: '安德雷 (Andre)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceAndre',
      },
      {
        id: 'Radio Gol',
        name: '拉迪奥·戈尔 (Radio Gol)',
        language: 'pt',
        gender: 'male',
        description: 'qwenVoiceRadioGol',
      },
      // 方言语音
      {
        id: 'Jada',
        name: '上海-阿珍 (Jada)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceJada',
      },
      {
        id: 'Dylan',
        name: '北京-晓东 (Dylan)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceDylan',
      },
      {
        id: 'Li',
        name: '南京-老李 (Li)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceLi',
      },
      {
        id: 'Marcus',
        name: '陕西-秦川 (Marcus)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceMarcus',
      },
      {
        id: 'Roy',
        name: '闽南-阿杰 (Roy)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceRoy',
      },
      {
        id: 'Peter',
        name: '天津-李彼得 (Peter)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoicePeter',
      },
      {
        id: 'Sunny',
        name: '四川-晴儿 (Sunny)',
        language: 'zh-CN',
        gender: 'female',
        description: 'qwenVoiceSunny',
      },
      {
        id: 'Eric',
        name: '四川-程川 (Eric)',
        language: 'zh-CN',
        gender: 'male',
        description: 'qwenVoiceEric',
      },
      {
        id: 'Rocky',
        name: '粤语-阿强 (Rocky)',
        language: 'zh-HK',
        gender: 'male',
        description: 'qwenVoiceRocky',
      },
      {
        id: 'Kiki',
        name: '粤语-阿清 (Kiki)',
        language: 'zh-HK',
        gender: 'female',
        description: 'qwenVoiceKiki',
      },
    ],
    supportedFormats: ['mp3', 'wav', 'pcm'],
  },

  'elevenlabs-tts': {
    id: 'elevenlabs-tts',
    name: 'ElevenLabs TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.elevenlabs.io/v1',
    icon: '/logos/elevenlabs.svg',
    // Free-tier-safe fallback set; account-specific/custom voices should come from /v2/voices dynamically later.
    voices: [
      {
        id: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Sarah',
        language: 'en-US',
        gender: 'female',
        description: 'Confident and warm professional voice for clear narration',
      },
      {
        id: 'Xb7hH8MSUJpSbSDYk0k2',
        name: 'Alice',
        language: 'en-GB',
        gender: 'female',
        description: 'Clear and engaging British educator voice for e-learning',
      },
      {
        id: 'XrExE9yKIg1WjnnlVkGX',
        name: 'Matilda',
        language: 'en-US',
        gender: 'female',
        description: 'Knowledgeable and upbeat voice suited for lectures',
      },
      {
        id: 'CwhRBWXzGAHq8TQ4Fs17',
        name: 'Roger',
        language: 'en-US',
        gender: 'male',
        description: 'Laid-back but resonant male voice for friendly lessons',
      },
      {
        id: 'cjVigY5qzO86Huf0OWal',
        name: 'Eric',
        language: 'en-US',
        gender: 'male',
        description: 'Smooth and trustworthy voice for polished classroom audio',
      },
      {
        id: 'onwK4e9ZLuTAKqWW03F9',
        name: 'Daniel',
        language: 'en-GB',
        gender: 'male',
        description: 'Steady British broadcaster voice for formal explanations',
      },
      {
        id: 'SAz9YHcvj6GT2YYXdXww',
        name: 'River',
        language: 'en-US',
        gender: 'neutral',
        description: 'Relaxed and informative neutral voice for general narration',
      },
    ],
    supportedFormats: ['mp3', 'opus', 'pcm', 'wav', 'ulaw', 'alaw'],
    speedRange: { min: 0.7, max: 1.2, default: 1.0 },
  },

  'browser-native-tts': {
    id: 'browser-native-tts',
    name: '浏览器原生 (Web Speech API)',
    requiresApiKey: false,
    icon: '/logos/browser.svg',
    voices: [
      // 注意：实际语音由浏览器和操作系统决定
      // 这些是占位符 —— 实际语音通过 speechSynthesis.getVoices() 动态获取
      { id: 'default', name: '默认', language: 'zh-CN', gender: 'neutral' },
    ],
    supportedFormats: ['browser'], // 浏览器原生音频
    speedRange: { min: 0.1, max: 10.0, default: 1.0 },
  },
};

/**
 * ASR 提供商注册表
 *
 * 所有 ASR 提供商的中央注册表。
 * 与 ASRProviderId 类型定义保持同步。
 */
export const ASR_PROVIDERS: Record<ASRProviderId, ASRProviderConfig> = {
  'openai-whisper': {
    id: 'openai-whisper',
    name: 'OpenAI Whisper',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '/logos/openai.svg',
    supportedLanguages: [
      // OpenAI Whisper 支持 58 种语言（根据官方文档）
      // 来源：https://platform.openai.com/docs/guides/speech-to-text
      'auto', // 自动检测
      // 热门语言（常用）
      'zh', // 中文
      'en', // 英语
      'ja', // 日语
      'ko', // 韩语
      'es', // 西班牙语
      'fr', // 法语
      'de', // 德语
      'ru', // 俄语
      'ar', // 阿拉伯语
      'pt', // 葡萄牙语
      'it', // 意大利语
      'hi', // 印地语
      // 其他语言（按字母排序）
      'af', // 南非荷兰语
      'hy', // 亚美尼亚语
      'az', // 阿塞拜疆语
      'be', // 白俄罗斯语
      'bs', // 波斯尼亚语
      'bg', // 保加利亚语
      'ca', // 加泰罗尼亚语
      'hr', // 克罗地亚语
      'cs', // 捷克语
      'da', // 丹麦语
      'nl', // 荷兰语
      'et', // 爱沙尼亚语
      'fi', // 芬兰语
      'gl', // 加利西亚语
      'el', // 希腊语
      'he', // 希伯来语
      'hu', // 匈牙利语
      'is', // 冰岛语
      'id', // 印尼语
      'kn', // 卡纳达语
      'kk', // 哈萨克语
      'lv', // 拉脱维亚语
      'lt', // 立陶宛语
      'mk', // 马其顿语
      'ms', // 马来语
      'mr', // 马拉地语
      'mi', // 毛利语
      'ne', // 尼泊尔语
      'no', // 挪威语
      'fa', // 波斯语
      'pl', // 波兰语
      'ro', // 罗马尼亚语
      'sr', // 塞尔维亚语
      'sk', // 斯洛伐克语
      'sl', // 斯洛文尼亚语
      'sw', // 斯瓦希里语
      'sv', // 瑞典语
      'tl', // 他加禄语
      'ta', // 泰米尔语
      'th', // 泰语
      'tr', // 土耳其语
      'uk', // 乌克兰语
      'ur', // 乌尔都语
      'vi', // 越南语
      'cy', // 威尔士语
    ],
    supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
  },

  'qwen-asr': {
    id: 'qwen-asr',
    name: 'Qwen ASR (阿里云百炼)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    icon: '/logos/bailian.svg',
    supportedLanguages: [
      // Qwen ASR 支持 27 种语言 + 自动检测
      // 如果语言不确定或混合（如中日英韩混合），使用 "auto"（不指定语言参数）
      'auto', // 自动检测（不指定语言参数）
      // 热门语言（常用）
      'zh', // 中文（普通话、四川话、闽南语、吴语等）
      'yue', // 粤语
      'en', // 英语
      'ja', // 日语
      'ko', // 韩语
      'de', // 德语
      'fr', // 法语
      'ru', // 俄语
      'es', // 西班牙语
      'pt', // 葡萄牙语
      'ar', // 阿拉伯语
      'it', // 意大利语
      'hi', // 印地语
      // 其他语言（按字母排序）
      'cs', // 捷克语
      'da', // 丹麦语
      'fi', // 芬兰语
      'fil', // 菲律宾语
      'id', // 印尼语
      'is', // 冰岛语
      'ms', // 马来语
      'no', // 挪威语
      'pl', // 波兰语
      'sv', // 瑞典语
      'th', // 泰语
      'tr', // 土耳其语
      'uk', // 乌克兰语
      'vi', // 越南语
    ],
    supportedFormats: ['mp3', 'wav', 'webm', 'm4a', 'flac'],
  },

  'browser-native': {
    id: 'browser-native',
    name: '浏览器原生 ASR (Web Speech API)',
    requiresApiKey: false,
    icon: '/logos/browser.svg',
    supportedLanguages: [
      // 中文变体
      'zh-CN', // 普通话（简体，中国）
      'zh-TW', // 普通话（繁体，台湾）
      'zh-HK', // 粤语（香港）
      'yue-Hant-HK', // 粤语（繁体）
      // 英语变体
      'en-US', // 英语（美国）
      'en-GB', // 英语（英国）
      'en-AU', // 英语（澳大利亚）
      'en-CA', // 英语（加拿大）
      'en-IN', // 英语（印度）
      'en-NZ', // 英语（新西兰）
      'en-ZA', // 英语（南非）
      // 日语和韩语
      'ja-JP', // 日语（日本）
      'ko-KR', // 韩语（韩国）
      // 欧洲语言
      'de-DE', // 德语（德国）
      'fr-FR', // 法语（法国）
      'es-ES', // 西班牙语（西班牙）
      'es-MX', // 西班牙语（墨西哥）
      'es-AR', // 西班牙语（阿根廷）
      'es-CO', // 西班牙语（哥伦比亚）
      'it-IT', // 意大利语（意大利）
      'pt-BR', // 葡萄牙语（巴西）
      'pt-PT', // 葡萄牙语（葡萄牙）
      'ru-RU', // 俄语（俄罗斯）
      'nl-NL', // 荷兰语（荷兰）
      'pl-PL', // 波兰语（波兰）
      'cs-CZ', // 捷克语（捷克共和国）
      'da-DK', // 丹麦语（丹麦）
      'fi-FI', // 芬兰语（芬兰）
      'sv-SE', // 瑞典语（瑞典）
      'no-NO', // 挪威语（挪威）
      'tr-TR', // 土耳其语（土耳其）
      'el-GR', // 希腊语（希腊）
      'hu-HU', // 匈牙利语（匈牙利）
      'ro-RO', // 罗马尼亚语（罗马尼亚）
      'sk-SK', // 斯洛伐克语（斯洛伐克）
      'bg-BG', // 保加利亚语（保加利亚）
      'hr-HR', // 克罗地亚语（克罗地亚）
      'ca-ES', // 加泰罗尼亚语（西班牙）
      // 中东和亚洲
      'ar-SA', // 阿拉伯语（沙特阿拉伯）
      'ar-EG', // 阿拉伯语（埃及）
      'he-IL', // 希伯来语（以色列）
      'hi-IN', // 印地语（印度）
      'th-TH', // 泰语（泰国）
      'vi-VN', // 越南语（越南）
      'id-ID', // 印尼语（印尼）
      'ms-MY', // 马来语（马来西亚）
      'fil-PH', // 菲律宾语（菲律宾）
      // 其他
      'af-ZA', // 南非荷兰语（南非）
      'uk-UA', // 乌克兰语（乌克兰）
    ],
    supportedFormats: ['webm'], // MediaRecorder 格式
  },
};

/**
 * 获取所有可用的 TTS 提供商
 */
export function getAllTTSProviders(): TTSProviderConfig[] {
  return Object.values(TTS_PROVIDERS);
}

/**
 * 根据 ID 获取 TTS 提供商
 */
export function getTTSProvider(providerId: TTSProviderId): TTSProviderConfig | undefined {
  return TTS_PROVIDERS[providerId];
}

/**
 * 每个 TTS 提供商的默认语音。
 * 用于切换提供商或测试非活动提供商时。
 */
export const DEFAULT_TTS_VOICES: Record<TTSProviderId, string> = {
  'openai-tts': 'alloy',
  'azure-tts': 'zh-CN-XiaoxiaoNeural',
  'glm-tts': 'tongtong',
  'qwen-tts': 'Cherry',
  'elevenlabs-tts': 'EXAVITQu4vr4xnSDxMaL',
  'browser-native-tts': 'default',
};

/**
 * 获取特定 TTS 提供商的语音列表
 */
export function getTTSVoices(providerId: TTSProviderId): TTSVoiceInfo[] {
  return TTS_PROVIDERS[providerId]?.voices || [];
}

/**
 * 获取所有可用的 ASR 提供商
 */
export function getAllASRProviders(): ASRProviderConfig[] {
  return Object.values(ASR_PROVIDERS);
}

/**
 * 根据 ID 获取 ASR 提供商
 */
export function getASRProvider(providerId: ASRProviderId): ASRProviderConfig | undefined {
  return ASR_PROVIDERS[providerId];
}

/**
 * 获取特定 ASR 提供商支持的语言列表
 */
export function getASRSupportedLanguages(providerId: ASRProviderId): string[] {
  return ASR_PROVIDERS[providerId]?.supportedLanguages || [];
}
