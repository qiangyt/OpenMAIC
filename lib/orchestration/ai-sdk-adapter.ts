/**
 * LangGraph 的 AI SDK 适配器
 *
 * 为 LLM 调用提供 LangChain 兼容的接口。
 * 使用统一的 callLLM / streamLLM 层，该层通过
 * Vercel AI SDK，支持所有提供商（OpenAI、Anthropic、Google 等）。
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatResult } from '@langchain/core/outputs';
import type { LanguageModel } from 'ai';

import { callLLM, streamLLM } from '@/lib/ai/llm';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';

const log = createLogger('AISdkAdapter');

/**
 * 流式生成的流块类型
 */
export type StreamChunk =
  | { type: 'delta'; content: string }
  | {
      type: 'tool_calls';
      toolCalls: {
        id: string;
        index: number;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { type: 'done'; content: string };

/**
 * 将任意 AI SDK LanguageModel 与 LangGraph 配合使用的适配器
 *
 * 接受 LanguageModel 实例（来自 getModel()）而非原始
 * API 凭证，从而支持所有提供商。
 */
export class AISdkLangGraphAdapter extends BaseChatModel {
  private languageModel: LanguageModel;
  private thinking?: ThinkingConfig;

  constructor(languageModel: LanguageModel, thinking?: ThinkingConfig) {
    super({});
    this.languageModel = languageModel;
    this.thinking = thinking;
  }

  _llmType(): string {
    return 'ai-sdk';
  }

  _combineLLMOutput() {
    return {};
  }

  /**
   * 将 LangChain 消息转换为 AI SDK 消息格式
   */
  private convertMessages(
    messages: BaseMessage[],
  ): { role: 'system' | 'user' | 'assistant'; content: string }[] {
    return messages.map((msg) => {
      if (msg instanceof HumanMessage) {
        return { role: 'user' as const, content: msg.content as string };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant' as const, content: msg.content as string };
      } else if (msg instanceof SystemMessage) {
        return { role: 'system' as const, content: msg.content as string };
      } else {
        return { role: 'user' as const, content: msg.content as string };
      }
    });
  }

  async _generate(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const aiMessages = this.convertMessages(messages);

    try {
      const result = await callLLM(
        {
          model: this.languageModel,
          messages: aiMessages,
        },
        'chat-adapter',
        undefined,
        this.thinking,
      );

      const content = result.text || '';

      log.info('[AI SDK Adapter] Response:', {
        textLength: content.length,
      });

      // 创建 AI 消息
      const aiMessage = new AIMessage({ content });

      return {
        generations: [
          {
            text: content,
            message: aiMessage,
          },
        ],
        llmOutput: {},
      };
    } catch (error) {
      log.error('[AI SDK Adapter Error]', error);
      throw error;
    }
  }

  /**
   * 带文本增量的流式生成
   *
   * 按到达顺序产出文本块，然后产出包含完整内容的 done。
   * 使用 streamLLM，该函数通过 Vercel AI SDK 的 streamText 实现。
   */
  async *streamGenerate(
    messages: BaseMessage[],
    options?: { tools?: Record<string, unknown>; signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);

    const result = streamLLM(
      {
        model: this.languageModel,
        messages: aiMessages,
        abortSignal: options?.signal,
      },
      'chat-adapter-stream',
      this.thinking,
    );

    let fullContent = '';

    for await (const chunk of result.textStream) {
      if (chunk) {
        fullContent += chunk;
        yield { type: 'delta', content: chunk };
      }
    }

    // 产出包含完整内容的 done
    yield { type: 'done', content: fullContent };
  }
}
