/**
 * 动作解析器 - 将结构化 JSON 数组输出转换为 Action[]
 *
 * 桥接无状态生成解析器（用于在线流式处理）与
 * 离线生成流水线，生成保留 LLM 输出原始交错顺序的类型化 Action 对象。
 *
 * 对于完整（非流式）响应，使用 JSON.parse 并以 partial-json 作为后备以确保鲁棒性。
 */

import type { Action, ActionType } from '@/lib/types/action';
import { SLIDE_ONLY_ACTIONS } from '@/lib/types/action';
import { nanoid } from 'nanoid';
import { parse as parsePartialJson, Allow } from 'partial-json';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('ActionParser');

/**
 * 从响应字符串中去除 markdown 代码块（```json ... ``` 或 ``` ... ```）。
 */
function stripCodeFences(text: string): string {
  // 移除开头的 ```json 或 ``` 和结尾的 ```
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
}

/**
 * 将完整的 LLM 响应（JSON 数组格式）解析为有序的 Action[] 数组。
 *
 * 期望格式（新）:
 * [{"type":"action","name":"spotlight","params":{"elementId":"..."}},
 *  {"type":"text","content":"speech content"},...]
 *
 * 也支持旧格式:
 * [{"type":"action","tool_name":"spotlight","parameters":{"elementId":"..."}},...]
 *
 * text 类型的项会变成 `speech` 动作；action 类型的项会转换为
 * 相应的动作类型（spotlight、discussion 等）。
 * 原始的交错顺序会被保留。
 */
export function parseActionsFromStructuredOutput(
  response: string,
  sceneType?: string,
  allowedActions?: string[],
): Action[] {
  // 步骤 1: 如果存在 markdown 代码块，去除它们
  const cleaned = stripCodeFences(response.trim());

  // 步骤 2: 查找 JSON 数组范围
  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');

  if (startIdx === -1) {
    log.warn('No JSON array found in response');
    return [];
  }

  const jsonStr = endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned.slice(startIdx); // 未闭合的数组 — 让 partial-json 处理

  // 步骤 3: 解析 — 先尝试 JSON.parse，然后 jsonrepair，最后回退到 partial-json
  let items: unknown[];
  try {
    items = JSON.parse(jsonStr);
  } catch {
    // 尝试 jsonrepair 修复格式错误的 JSON（例如中文文本中的未转义引号）
    try {
      items = JSON.parse(jsonrepair(jsonStr));
      log.info('Recovered malformed JSON via jsonrepair');
    } catch {
      try {
        items = parsePartialJson(
          jsonStr,
          Allow.ARR | Allow.OBJ | Allow.STR | Allow.NUM | Allow.BOOL | Allow.NULL,
        );
      } catch (e) {
        log.warn('Failed to parse JSON array:', (e as Error).message);
        return [];
      }
    }
  }

  if (!Array.isArray(items)) {
    log.warn('Parsed result is not an array');
    return [];
  }

  // 步骤 4: 将项转换为 Action[]
  const actions: Action[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || !('type' in item)) continue;
    const typedItem = item as Record<string, unknown>;

    if (typedItem.type === 'text') {
      const text = ((typedItem.content as string) || '').trim();
      if (text) {
        actions.push({
          id: `action_${nanoid(8)}`,
          type: 'speech',
          text,
        });
      }
    } else if (typedItem.type === 'action') {
      try {
        // 同时支持新格式 (name/params) 和旧格式 (tool_name/parameters)
        const actionName = typedItem.name || typedItem.tool_name;
        const actionParams = (typedItem.params || typedItem.parameters || {}) as Record<
          string,
          unknown
        >;
        actions.push({
          id: (typedItem.action_id || typedItem.tool_id || `action_${nanoid(8)}`) as string,
          type: actionName as Action['type'],
          ...actionParams,
        } as Action);
      } catch (_e) {
        log.warn('Invalid action item, skipping:', JSON.stringify(typedItem).slice(0, 100));
      }
    }
  }

  // 步骤 5: 后处理 — discussion 必须是最后一个动作，且最多一个
  const discussionIdx = actions.findIndex((a) => a.type === 'discussion');
  if (discussionIdx !== -1 && discussionIdx < actions.length - 1) {
    actions.splice(discussionIdx + 1);
  }

  // 步骤 6: 对于非 slide 场景，过滤掉仅限 slide 的动作（深度防御）
  if (sceneType && sceneType !== 'slide') {
    const before = actions.length;
    const filtered = actions.filter((a) => !SLIDE_ONLY_ACTIONS.includes(a.type as ActionType));
    if (filtered.length < before) {
      log.info(`Stripped ${before - filtered.length} slide-only action(s) from ${sceneType} scene`);
    }
    return filtered;
  }

  // 步骤 7: 按 allowedActions 白名单过滤（深度防御，用于基于角色的隔离）
  // 捕获不在智能体允许集合中的幻觉动作，例如学生智能体
  // 在聊天历史中看到教师动作后模仿 spotlight/laser。
  if (allowedActions && allowedActions.length > 0) {
    const before = actions.length;
    const filtered = actions.filter((a) => a.type === 'speech' || allowedActions.includes(a.type));
    if (filtered.length < before) {
      log.info(
        `Stripped ${before - filtered.length} disallowed action(s) by allowedActions whitelist`,
      );
    }
    return filtered;
  }

  return actions;
}
