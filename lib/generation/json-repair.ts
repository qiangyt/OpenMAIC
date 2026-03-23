/**
 * AI 生成响应的 JSON 解析，带回退策略。
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

export function parseJsonResponse<T>(response: string): T | null {
  // 策略 1: 尝试从 markdown 代码块中提取 JSON（可能有多个）
  const codeBlockMatches = response.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const match of codeBlockMatches) {
    const extracted = match[1].trim();
    // 只有看起来像 JSON（以 { 或 [ 开头）才尝试
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      const result = tryParseJson<T>(extracted);
      if (result !== null) {
        log.debug('Successfully parsed JSON from code block');
        return result;
      }
    }
  }

  // 策略 2: 尝试直接在响应中查找 JSON 结构（无代码块）
  // 查找数组或对象的起始位置
  const jsonStartArray = response.indexOf('[');
  const jsonStartObject = response.indexOf('{');

  if (jsonStartArray !== -1 || jsonStartObject !== -1) {
    // 优先选择先出现的结构
    const startIndex =
      jsonStartArray === -1
        ? jsonStartObject
        : jsonStartObject === -1
          ? jsonStartArray
          : Math.min(jsonStartArray, jsonStartObject);

    // 查找匹配的闭合括号
    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < response.length; i++) {
      const char = response[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const jsonStr = response.substring(startIndex, endIndex + 1);
      const result = tryParseJson<T>(jsonStr);
      if (result !== null) {
        log.debug('Successfully parsed JSON from response body');
        return result;
      }
    }
  }

  // 策略 3: 最后手段 - 尝试整个响应
  const result = tryParseJson<T>(response.trim());
  if (result !== null) {
    log.debug('Successfully parsed raw response as JSON');
    return result;
  }

  log.error('Failed to parse JSON from response');
  log.error('Raw response (first 500 chars):', response.substring(0, 500));

  return null;
}

/**
 * 尝试解析 JSON，对 AI 响应中的常见问题进行各种修复
 */
export function tryParseJson<T>(jsonStr: string): T | null {
  // 尝试 1: 按原样解析
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // 继续尝试修复
  }

  // 尝试 2: 修复 AI 响应中的常见 JSON 问题
  try {
    let fixed = jsonStr;

    // 修复 1: 处理会破坏 JSON 的 LaTeX 风格转义（如 \frac, \left, \right, \times 等）
    // 这些在数学内容中很常见，需要双重转义
    // 匹配字符串内的反斜杠后跟字母（LaTeX 命令）
    fixed = fixed.replace(/"([^"]*?)"/g, (_match, content) => {
      // 双重转义任何反斜杠后跟字母（除了有效的 JSON 转义）
      const fixedContent = content.replace(/\\([a-zA-Z])/g, '\\\\$1');
      return `"${fixedContent}"`;
    });

    // 修复 2: 修复其他无效的转义序列（如 \S, \L 等）
    // 有效的 JSON 转义: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
    fixed = fixed.replace(/\\([^"\\\/bfnrtu\n\r])/g, (match, char) => {
      // 如果是字母，很可能是 LaTeX 命令
      if (/[a-zA-Z]/.test(char)) {
        return '\\\\' + char;
      }
      return match;
    });

    // 修复 3: 尝试修复被截断的 JSON 数组/对象
    const trimmed = fixed.trim();
    if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      const lastCompleteObj = fixed.lastIndexOf('}');
      if (lastCompleteObj > 0) {
        fixed = fixed.substring(0, lastCompleteObj + 1) + ']';
        log.warn('Fixed truncated JSON array');
      }
    } else if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      // 尝试闭合不完整的对象
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
        log.warn('Fixed truncated JSON object');
      }
    }

    return JSON.parse(fixed) as T;
  } catch {
    // 继续下一个尝试
  }

  // 尝试 3: 使用 jsonrepair 修复格式错误的 JSON（例如中文文本中的未转义引号）
  try {
    const repaired = jsonrepair(jsonStr);
    return JSON.parse(repaired) as T;
  } catch {
    // 继续下一个尝试
  }

  // 尝试 4: 更激进的修复 - 移除控制字符
  try {
    let fixed = jsonStr;

    // 移除或转义控制字符
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
      switch (char) {
        case '\n':
          return '\\n';
        case '\r':
          return '\\r';
        case '\t':
          return '\\t';
        default:
          return '';
      }
    });

    return JSON.parse(fixed) as T;
  } catch {
    return null;
  }
}
