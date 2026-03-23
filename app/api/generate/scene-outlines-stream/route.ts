/**
 * 场景大纲流式 API (SSE)
 *
 * 通过 Server-Sent Events 流式传输大纲生成。
 * 在从 LLM 响应解析时逐个发出大纲对象，
 * 以便前端可以增量显示它们。
 *
 * SSE events:
 *   { type: 'outline', data: SceneOutline, index: number }
 *   { type: 'done', outlines: SceneOutline[] }
 *   { type: 'error', error: string }
 */

import { NextRequest } from 'next/server';
import { streamLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import {
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
  uniquifyMediaElementIds,
  formatTeacherPersonaForPrompt,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type {
  UserRequirements,
  PdfImage,
  SceneOutline,
  ImageMapping,
} from '@/lib/types/generation';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
const log = createLogger('Outlines Stream');

export const maxDuration = 300;

/**
 * 增量 JSON 数组解析器。
 * 从部分流式传输的 JSON 数组中提取完整的顶级对象。
 * 返回新找到的对象（跳过 `alreadyParsed` 计数）。
 */
function extractNewOutlines(buffer: string, alreadyParsed: number): SceneOutline[] {
  const results: SceneOutline[] = [];

  // 找到 JSON 数组的起始位置（跳过任何 markdown 围栏）
  const stripped = buffer.replace(/^[\s\S]*?(?=\[)/, '');
  const arrayStart = stripped.indexOf('[');
  if (arrayStart === -1) return results;

  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  let objectCount = 0;

  for (let i = arrayStart + 1; i < stripped.length; i++) {
    const char = stripped[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        objectCount++;
        if (objectCount > alreadyParsed) {
          try {
            const obj = JSON.parse(stripped.substring(objectStart, i + 1));
            results.push(obj);
          } catch {
            // 不完整或无效的 JSON — 跳过
          }
        }
        objectStart = -1;
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 从请求 headers 获取 API 配置
    const { model: languageModel, modelInfo, modelString } = resolveModelFromHeaders(req);

    if (!body.requirements) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Requirements are required');
    }

    const { requirements, pdfText, pdfImages, imageMapping, researchContext, agents } = body as {
      requirements: UserRequirements;
      pdfText?: string;
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      researchContext?: string;
      agents?: AgentInfo[];
    };

    // 检测视觉能力
    const hasVision = !!modelInfo?.capabilities?.vision;

    // 构建 prompt（与 generateSceneOutlinesFromRequirements 逻辑相同）
    let availableImagesText =
      requirements.language === 'zh-CN' ? '无可用图片' : 'No images available';
    let visionImages: Array<{ id: string; src: string }> | undefined;

    if (pdfImages && pdfImages.length > 0) {
      if (hasVision && imageMapping) {
        // 视觉模式：分为视觉图片（前 N 张）和纯文本（其余）
        const allWithSrc = pdfImages.filter((img) => imageMapping[img.id]);
        const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
        const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
        const noSrcImages = pdfImages.filter((img) => !imageMapping[img.id]);

        const visionDescriptions = visionSlice.map((img) =>
          formatImagePlaceholder(img, requirements.language),
        );
        const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img, requirements.language),
        );
        availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

        visionImages = visionSlice.map((img) => ({
          id: img.id,
          src: imageMapping[img.id],
          width: img.width,
          height: img.height,
        }));
      } else {
        // 纯文本模式：完整描述
        availableImagesText = pdfImages
          .map((img) => formatImageDescription(img, requirements.language))
          .join('\n');
      }
    }

    // 根据启用的标志构建媒体生成策略
    const imageGenerationEnabled = req.headers.get('x-image-generation-enabled') === 'true';
    const videoGenerationEnabled = req.headers.get('x-video-generation-enabled') === 'true';
    let mediaGenerationPolicy = '';
    if (!imageGenerationEnabled && !videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
    } else if (!imageGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
    } else if (!videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
    }

    // 从智能体构建教师上下文（如果可用）
    const teacherContext = formatTeacherPersonaForPrompt(agents);

    const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: requirements.requirement,
      language: requirements.language,
      pdfContent: pdfText
        ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS)
        : requirements.language === 'zh-CN'
          ? '无'
          : 'None',
      availableImages: availableImagesText,
      researchContext: researchContext || (requirements.language === 'zh-CN' ? '无' : 'None'),
      mediaGenerationPolicy,
      teacherContext,
    });

    if (!prompts) {
      return apiError('INTERNAL_ERROR', 500, 'Prompt template not found');
    }

    log.info(
      `Generating outlines: "${requirements.requirement.substring(0, 50)}" [model=${modelString}]`,
    );

    // 创建带心跳的 SSE 流以防止连接超时
    const encoder = new TextEncoder();
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const stream = new ReadableStream({
      async start(controller) {
        // 心跳：定期发送 SSE 注释以保持连接活跃。
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`:heartbeat\n\n`));
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

        const MAX_STREAM_RETRIES = 2;

        try {
          startHeartbeat();

          const streamParams = visionImages?.length
            ? {
                model: languageModel,
                system: prompts.system,
                messages: [
                  {
                    role: 'user' as const,
                    content: buildVisionUserContent(prompts.user, visionImages),
                  },
                ],
                maxOutputTokens: modelInfo?.outputWindow,
              }
            : {
                model: languageModel,
                system: prompts.system,
                prompt: prompts.user,
                maxOutputTokens: modelInfo?.outputWindow,
              };

          let parsedOutlines: SceneOutline[] = [];
          let lastError: string | undefined;

          for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            try {
              const result = streamLLM(streamParams, 'scene-outlines-stream');

              let fullText = '';
              parsedOutlines = [];

              for await (const chunk of result.textStream) {
                fullText += chunk;

                // 尝试从累积的文本中提取新大纲
                const newOutlines = extractNewOutlines(fullText, parsedOutlines.length);
                for (const outline of newOutlines) {
                  // 确保 ID 和顺序
                  const enriched = {
                    ...outline,
                    id: outline.id || nanoid(),
                    order: parsedOutlines.length + 1,
                  };
                  parsedOutlines.push(enriched);

                  const event = JSON.stringify({
                    type: 'outline',
                    data: enriched,
                    index: parsedOutlines.length - 1,
                  });
                  controller.enqueue(encoder.encode(`data: ${event}\n\n`));
                }
              }

              // 验证：获取到大纲了吗？
              if (parsedOutlines.length > 0) break;

              // 空结果 — 如果还有剩余尝试次数则重试
              lastError = fullText.trim()
                ? 'LLM response could not be parsed into outlines'
                : 'LLM returned empty response';

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Empty outlines (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                );
                // 通知客户端正在重试
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Stream error (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                  error,
                );
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
                continue;
              }
            }
          }

          if (parsedOutlines.length > 0) {
            // 将顺序 gen_img_N/gen_vid_N 替换为全局唯一 ID
            const uniquifiedOutlines = uniquifyMediaElementIds(parsedOutlines);
            // 发送包含所有大纲的完成事件
            const doneEvent = JSON.stringify({
              type: 'done',
              outlines: uniquifiedOutlines,
            });
            controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
          } else {
            // 所有重试已用尽，未生成大纲
            log.error(
              `Outline generation failed after ${MAX_STREAM_RETRIES + 1} attempts: ${lastError}`,
            );
            const errorEvent = JSON.stringify({
              type: 'error',
              error: lastError || 'Failed to generate outlines',
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          }
        } catch (error) {
          const errorEvent = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        } finally {
          stopHeartbeat();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Streaming error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
