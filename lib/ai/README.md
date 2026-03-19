# AI 提供者抽象模块 (lib/ai/)

> 统一的 LLM 提供者抽象层，支持多种 AI 模型提供商的统一调用

## 概览

本模块实现了 OpenMAIC 的 AI 模型统一调用层，核心特性：

1. **多提供者支持**: OpenAI、Anthropic、Google、国产大模型（GLM、Qwen、DeepSeek 等）
2. **统一接口**: 基于 Vercel AI SDK 的标准化调用方式
3. **Thinking/Reasoning 适配**: 处理不同厂商的思考模式 API 差异
4. **服务端/客户端分离**: 支持浏览器端和服务器端两种运行模式

```
┌─────────────────────────────────────────────────────────────────┐
│                     调用方 (生成/编排)                           │
├─────────────────────────────────────────────────────────────────┤
│                               │                                 │
│                               ▼                                 │
│                    ┌──────────────────┐                         │
│                    │   callLLM()      │  ← 统一入口              │
│                    │   streamLLM()    │                         │
│                    └────────┬─────────┘                         │
│                             │                                   │
│                    ┌────────▼─────────┐                         │
│                    │ Thinking Adapter │  ← 思考模式适配          │
│                    └────────┬─────────┘                         │
│                             │                                   │
│                    ┌────────▼─────────┐                         │
│                    │    getModel()    │  ← 模型实例化            │
│                    └────────┬─────────┘                         │
│                             │                                   │
│        ┌────────────────────┼────────────────────┐              │
│        ▼                    ▼                    ▼              │
│   @ai-sdk/openai     @ai-sdk/anthropic    @ai-sdk/google        │
│        │                    │                    │              │
│        └────────────────────┴────────────────────┘              │
│                             │                                   │
│                             ▼                                   │
│                    各厂商 API 端点                               │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `providers.ts` | 提供者注册表、模型配置、`getModel()` 工厂函数 |
| `llm.ts` | 统一 LLM 调用层 - `callLLM()` 和 `streamLLM()` |
| `thinking-context.ts` | AsyncLocalStorage 承载 Thinking 配置 |

## 提供者注册表 (providers.ts)

### 内置提供者

```typescript
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    type: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', capabilities: { vision: true, tools: true } },
      { id: 'o1', name: 'o1', capabilities: { thinking: { toggleable: false, ... } } },
      ...
    ],
  },
  anthropic: {
    name: 'Anthropic',
    type: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', capabilities: { thinking: { ... } } },
      ...
    ],
  },
  google: { ... },
  // 国产大模型
  glm: { type: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', ... },
  qwen: { type: 'openai', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', ... },
  deepseek: { type: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1', ... },
  kimi: { type: 'openai', ... },
  minimax: { type: 'openai', ... },
  siliconflow: { type: 'openai', ... },
  doubao: { type: 'openai', ... },
};
```

### ProviderId 类型

```typescript
type BuiltInProviderId =
  | 'openai' | 'anthropic' | 'google'
  | 'deepseek' | 'qwen' | 'kimi' | 'minimax' | 'glm' | 'siliconflow' | 'doubao';

type ProviderId = BuiltInProviderId | `custom-${string}`;
```

### 模型实例化 (getModel)

```typescript
function getModel(config: ModelConfig): LanguageModel {
  const { providerId, modelId, apiKey, baseUrl, providerType, requiresApiKey } = config;

  // 1. 根据 providerType 选择 AI SDK
  switch (providerType) {
    case 'anthropic':
      return anthropic(modelId, { apiKey, baseURL: baseUrl });

    case 'google':
      return google(modelId, { apiKey, baseURL: baseUrl });

    case 'openai':
    default:
      // 大多数国产模型使用 OpenAI 兼容 API
      return openai(modelId, {
        apiKey,
        baseURL: baseUrl,
        compatibility: 'compatible',
        fetch: customFetch,  // 注入 Thinking 参数
      });
  }
}
```

### 自定义 Fetch 与 Thinking 注入

```typescript
// providers.ts 使用 globalThis.__thinkingContext 获取配置
const customFetch: typeof fetch = async (url, init) => {
  const thinkingContext = (globalThis as any).__thinkingContext;
  const thinkingConfig = thinkingContext?.getStore();

  if (thinkingConfig && init?.body) {
    const body = JSON.parse(init.body as string);

    // Anthropic: extended thinking
    if (url.includes('anthropic.com')) {
      if (thinkingConfig.enabled !== false) {
        body.thinking = {
          type: 'enabled',
          budget_tokens: thinkingConfig.budgetTokens || 16000,
        };
      }
    }

    // DeepSeek: reasoning_effort
    if (url.includes('deepseek.com') && model.includes('reasoner')) {
      // DeepSeek R1 不支持禁用思考
    }

    init.body = JSON.stringify(body);
  }

  return originalFetch(url, init);
};
```

## 统一 LLM 调用层 (llm.ts)

### callLLM - 单次调用

```typescript
interface CallLLMOptions {
  model: LanguageModel;
  systemPrompt: string;
  userPrompt: string;
  images?: Array<{ id: string; src: string }>;  // Vision 支持
  maxTokens?: number;
  temperature?: number;
  thinking?: ThinkingConfig;  // 思考模式配置
  signal?: AbortSignal;
}

async function callLLM(options: CallLLMOptions): Promise<string> {
  const { model, systemPrompt, userPrompt, images, thinking, ...rest } = options;

  // 构建 Vercel AI SDK 消息格式
  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: images?.length
        ? [
            { type: 'image', image: images[0].src },
            { type: 'text', text: userPrompt },
          ]
        : userPrompt,
    },
  ];

  // 使用 thinkingContext 包装调用
  return thinkingContext.run(thinking, async () => {
    const response = await generateText({
      model,
      messages,
      ...rest,
    });

    return response.text;
  });
}
```

### streamLLM - 流式调用

```typescript
interface StreamLLMOptions extends CallLLMOptions {
  onChunk?: (chunk: string) => void;
}

async function* streamLLM(options: StreamLLMOptions): AsyncGenerator<string> {
  const { model, systemPrompt, userPrompt, onChunk, thinking, ...rest } = options;

  // 构建消息
  const messages: ModelMessage[] = [ ... ];

  // 流式生成
  return thinkingContext.run(thinking, async function* () {
    const stream = await streamText({
      model,
      messages,
      ...rest,
    });

    for await (const chunk of stream.textStream) {
      if (onChunk) onChunk(chunk);
      yield chunk;
    }
  });
}
```

### 重试与验证

```typescript
async function callLLMWithRetry(options: CallLLMOptions, maxRetries = 3): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await callLLM(options);

      // 验证响应有效性
      if (validateResponse(result)) {
        return result;
      }

      throw new Error('Invalid response format');
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await delay(1000 * (attempt + 1));  // 指数退避
      }
    }
  }

  throw lastError;
}
```

## Thinking/Reasoning 适配

### ThinkingCapability 定义

```typescript
interface ThinkingCapability {
  toggleable: boolean;       // 能否通过 API 禁用
  budgetAdjustable: boolean; // 能否调整思考预算
  defaultEnabled: boolean;   // 默认是否启用
}

// 示例：不同模型的 Thinking 能力
const MODEL_THINKING_CAPABILITIES = {
  // Anthropic Claude: 完全可控
  'claude-sonnet-4-20250514': {
    toggleable: true,
    budgetAdjustable: true,
    defaultEnabled: false,
  },

  // OpenAI o1: 不可禁用，不可调预算
  'o1': {
    toggleable: false,
    budgetAdjustable: false,
    defaultEnabled: true,
  },

  // DeepSeek R1: 不可禁用
  'deepseek-reasoner': {
    toggleable: false,
    budgetAdjustable: false,
    defaultEnabled: true,
  },
};
```

### 适配策略

| 模型 | enabled=true | enabled=false | budgetTokens |
|------|-------------|---------------|--------------|
| Claude 4 | `thinking: { type: 'enabled', budget_tokens }` | 不传 thinking 字段 | 直接使用 |
| o1 | 默认启用，忽略配置 | 报 warn，继续执行 | 忽略 |
| DeepSeek R1 | 默认启用 | 报 warn，继续执行 | 忽略 |
| GPT-4o | 不支持，忽略 | 忽略 | 忽略 |

### AsyncLocalStorage 上下文传递

```typescript
// thinking-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export const thinkingContext = new AsyncLocalStorage<ThinkingConfig | undefined>();

// 暴露到 globalThis 避免客户端打包问题
(globalThis as any).__thinkingContext = thinkingContext;

// 使用方式
thinkingContext.run({ enabled: true, budgetTokens: 8000 }, async () => {
  // 在此作用域内的所有 fetch 调用都会自动注入 thinking 参数
  await callLLM({ ... });
});
```

## 模型能力查询

```typescript
// 检查模型是否支持 Vision
function supportsVision(providerId: ProviderId, modelId: string): boolean {
  const provider = PROVIDERS[providerId];
  const model = provider?.models.find(m => m.id === modelId);
  return model?.capabilities?.vision ?? false;
}

// 检查模型是否支持 Tools
function supportsTools(providerId: ProviderId, modelId: string): boolean {
  const provider = PROVIDERS[providerId];
  const model = provider?.models.find(m => m.id === modelId);
  return model?.capabilities?.tools ?? false;
}

// 获取 Thinking 能力
function getThinkingCapability(providerId: ProviderId, modelId: string): ThinkingCapability | undefined {
  const provider = PROVIDERS[providerId];
  const model = provider?.models.find(m => m.id === modelId);
  return model?.capabilities?.thinking;
}
```

## 服务端/客户端分离

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  settings.ts (读取 providers.ts)                            │ │
│  │  - PROVIDERS 注册表（仅配置，无 node:async_hooks）           │ │
│  │  - getModel() 不可用（需要 apiKey）                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API 调用
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         服务端                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  llm.ts + thinking-context.ts                               │ │
│  │  - callLLM() / streamLLM()                                  │ │
│  │  - thinkingContext (AsyncLocalStorage)                      │ │
│  │  - customFetch (注入 thinking 参数)                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 模块导入注意事项

```typescript
// ✅ 客户端可导入
import { PROVIDERS, type ProviderId } from '@/lib/ai/providers';

// ❌ 客户端不可导入（包含 node:async_hooks）
import { thinkingContext } from '@/lib/ai/thinking-context';

// ✅ 服务端专用
import { callLLM, streamLLM } from '@/lib/ai/llm';
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/ai/                                  │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - ai (Vercel AI SDK)                                          │
│  - @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google          │
│  - lib/types/provider.ts (ThinkingConfig, ProviderConfig)     │
│  - node:async_hooks (仅服务端)                                  │
│                                                                 │
│  被依赖:                                                        │
│  - lib/generation/ (课程生成)                                   │
│  - lib/orchestration/ (多智能体编排)                            │
│  - app/api/ (API 路由)                                          │
│  - lib/store/settings.ts (客户端配置)                           │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用 Vercel AI SDK？

1. **统一抽象**: OpenAI/Anthropic/Google API 差异被屏蔽
2. **流式支持**: 原生 `streamText()` 和 `textStream`
3. **类型安全**: 完整的 TypeScript 支持
4. **兼容性**: 大多数国产模型支持 OpenAI 兼容模式

### 为什么 Thinking 使用 AsyncLocalStorage？

1. **无侵入**: 不需要修改所有函数签名传递配置
2. **作用域隔离**: 每个请求独立的 Thinking 配置
3. **延迟绑定**: fetch 包装器在调用时才读取配置

### 为什么自定义 fetch 而非 providerOptions？

1. **兼容性**: AI SDK 的 providerOptions 对不同厂商参数名不同
2. **灵活性**: 可以动态判断 URL 注入正确的参数
3. **集中控制**: 所有厂商的 Thinking 逻辑统一管理
