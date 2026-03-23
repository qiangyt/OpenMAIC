import { Badge } from '@/components/ui/badge';
import { CheckCircleIcon, CircleIcon, ClockIcon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement } from 'react';

/**
 * 将 SSE 状态字符串映射到 `actions.status.*` 下的 i18n 键
 */
const statusKeyMap: Record<string, string> = {
  'input-streaming': 'inputStreaming',
  'input-available': 'inputAvailable',
  'output-available': 'outputAvailable',
  'output-error': 'outputError',
  'output-denied': 'outputDenied',
  running: 'running',
  result: 'result',
  error: 'error',
};

/**
 * 将动作名称解析为其 i18n 显示名称。
 * 如果没有翻译则回退到原始 actionName。
 */
export function getActionDisplayName(t: (key: string) => string, actionName: string): string {
  const translated = t(`actions.names.${actionName}`);
  // t() 在缺少翻译时返回键本身
  return translated === `actions.names.${actionName}` ? actionName : translated;
}

/**
 * 获取动作状态的本地化状态徽章。
 */
export function getStatusBadge(t: (key: string) => string, state: string): ReactNode {
  const iconMap: Record<string, ReactNode> = {
    'input-streaming': createElement(CircleIcon, { className: 'size-4' }),
    'input-available': createElement(ClockIcon, {
      className: 'size-4 animate-pulse',
    }),
    'output-available': createElement(CheckCircleIcon, {
      className: 'size-4 text-green-600',
    }),
    'output-error': createElement(XCircleIcon, {
      className: 'size-4 text-red-600',
    }),
    'output-denied': createElement(XCircleIcon, {
      className: 'size-4 text-orange-600',
    }),
    running: createElement(ClockIcon, { className: 'size-4 animate-pulse' }),
    result: createElement(CheckCircleIcon, {
      className: 'size-4 text-green-600',
    }),
    error: createElement(XCircleIcon, { className: 'size-4 text-red-600' }),
  };

  const i18nKey = statusKeyMap[state];
  const label = i18nKey ? t(`actions.status.${i18nKey}`) : state;

  return createElement(
    Badge,
    {
      className: 'gap-1.5 rounded-full text-xs',
      variant: 'secondary' as const,
    },
    iconMap[state] || createElement(CircleIcon, { className: 'size-4' }),
    label,
  );
}

/**
 * 从消息中提取文本部分
 */
export function getMessageTextParts(message: {
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>;
}) {
  if (!message.parts || message.parts.length === 0) {
    return [];
  }
  return message.parts.filter((part) => part.type === 'text' || part.type === 'step-start');
}

/**
 * 从消息中提取动作部分
 */
export function getMessageActionParts(message: {
  parts?: Array<{ type: string; [key: string]: unknown }>;
}) {
  if (!message.parts || message.parts.length === 0) {
    return [];
  }
  return message.parts.filter((part) => part.type && part.type.startsWith('action-'));
}
