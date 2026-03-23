/**
 * 无状态聊天 API 端点
 *
 * POST /api/chat - 发送消息，接收 SSE 流
 *
 * 此端点：
 * 1. 从客户端接收完整状态（messages + storeState）
 * 2. 运行单次生成
 * 3. 以 SSE 流式传输事件（文本增量 + 工具调用）
 *
 * 完全无状态：中断由客户端中止 fetch 请求处理，
 * 这会在服务器端触发 req.signal。
 */

import { NextRequest } from 'next/server';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveModel } from '@/lib/server/resolve-model';
const log = createLogger('Chat API');

// 允许流式响应最长 60 秒
export const maxDuration = 60;

/**
 * POST /api/chat
 * 发送消息并接收生成事件的 SSE 流
 *
 * Request body: StatelessChatRequest
 * {
 *   messages: UIMessage[],
 *   storeState: { stage, scenes, currentSceneId, mode },
 *   config: { agentIds, sessionType? },
 *   apiKey: string,
 *   baseUrl?: string,
 *   model?: string
 * }
 *
 * Response: StatelessEvent 的 SSE 流
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body: StatelessChatRequest = await req.json();

    // 验证必填字段
    if (!body.messages || !Array.isArray(body.messages)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
    }

    if (!body.storeState) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: storeState');
    }

    if (!body.config || !body.config.agentIds || body.config.agentIds.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: config.agentIds');
    }

    const { model: languageModel, apiKey: resolvedApiKey } = resolveModel({
      modelString: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      providerType: body.providerType,
      requiresApiKey: body.requiresApiKey,
    });

    if (!resolvedApiKey && body.requiresApiKey !== false) {
      return apiError('MISSING_API_KEY', 401, 'API Key is required');
    }

    log.info('Processing request');
    log.info(
      `Agents: ${body.config.agentIds.join(', ')}, Messages: ${body.messages.length}, Turn: ${body.directorState?.turnCount ?? 0}`,
    );

    // Use the native request signal for abort propagation
    const signal = req.signal;

    // 创建 SSE 流
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // 在后台流式生成，使用心跳防止连接超时
    const HEARTBEAT_INTERVAL_MS = 15_000;
    (async () => {
      // 心跳：定期发送 SSE 注释以保持连接活跃。
      // 代理/浏览器可能会在 30-120 秒无活动后关闭空闲的 SSE 连接。
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
          try {
            writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
          } catch {
            stopHeartbeat();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();

        const generator = statelessGenerate(
          {
            ...body,
            apiKey: resolvedApiKey,
          },
          signal,
          languageModel,
          { enabled: false } satisfies ThinkingConfig,
        );

        for await (const event of generator) {
          if (signal.aborted) {
            log.info('Request was aborted');
            break;
          }

          const data = `data: ${JSON.stringify(event)}\n\n`;
          await writer.write(encoder.encode(data));
        }

        stopHeartbeat();
        await writer.close();
      } catch (error) {
        stopHeartbeat();

        // 如果已中止，静默关闭 writer
        if (signal.aborted) {
          log.info('Request aborted during streaming');
          try {
            await writer.close();
          } catch {
            /* 已关闭 */
          }
          return;
        }

        log.error('Stream error:', error);

        // 尝试发送错误事件
        try {
          const errorEvent: StatelessEvent = {
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          await writer.close();
        } catch {
          // Writer 可能已关闭
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process request',
    );
  }
}
