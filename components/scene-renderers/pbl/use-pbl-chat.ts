'use client';

/**
 * PBL 聊天 Hook - 管理聊天状态、@提及解析和 API 调用
 */

import { useState, useCallback } from 'react';
import type { PBLProjectConfig, PBLChatMessage, PBLAgent, PBLIssue } from '@/lib/pbl/types';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';

const log = createLogger('PBLChat');

interface UsePBLChatOptions {
  projectConfig: PBLProjectConfig;
  userRole: string;
  onConfigUpdate: (config: PBLProjectConfig) => void;
}

export function usePBLChat({ projectConfig, userRole, onConfigUpdate }: UsePBLChatOptions) {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);

  const messages = projectConfig.chat.messages;

  const currentIssue = projectConfig.issueboard.issues.find((i) => i.is_active) || null;

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const updatedConfig = {
        ...projectConfig,
        chat: {
          ...projectConfig.chat,
          messages: [...projectConfig.chat.messages],
        },
      };

      // 添加用户消息
      const userMsg: PBLChatMessage = {
        id: `msg_${Date.now()}_user`,
        agent_name: userRole,
        message: text,
        timestamp: Date.now(),
        read_by: [userRole],
      };
      updatedConfig.chat.messages.push(userMsg);
      onConfigUpdate(updatedConfig);

      // 解析 @提及以确定目标智能体，回退到问答智能体
      const targetAgent = resolveTargetAgent(text, currentIssue, projectConfig.agents);
      if (!targetAgent) return;

      setIsLoading(true);

      try {
        const modelConfig = getCurrentModelConfig();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-model': modelConfig.modelString,
          'x-api-key': modelConfig.apiKey,
        };
        if (modelConfig.baseUrl) headers['x-base-url'] = modelConfig.baseUrl;
        if (modelConfig.providerType) headers['x-provider-type'] = modelConfig.providerType;
        if (modelConfig.requiresApiKey) headers['x-requires-api-key'] = 'true';

        // 如果消息文本中有 @提及前缀，则移除
        const cleanMessage = text.replace(/^@\w+\s*/i, '').trim() || text;

        const isJudgeAgent = currentIssue && targetAgent.name === currentIssue.judge_agent_name;

        const response = await fetch('/api/pbl/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: cleanMessage,
            agent: targetAgent,
            currentIssue,
            recentMessages: updatedConfig.chat.messages.slice(-10).map((m) => ({
              agent_name: m.agent_name,
              message: m.message,
            })),
            userRole,
            agentType: isJudgeAgent ? 'judge' : 'question',
          }),
        });

        const data = await response.json();

        if (data.success) {
          const agentMsg: PBLChatMessage = {
            id: `msg_${Date.now()}_agent`,
            agent_name: targetAgent.name,
            message: data.message,
            timestamp: Date.now(),
            read_by: [],
          };

          const afterConfig = {
            ...updatedConfig,
            chat: { messages: [...updatedConfig.chat.messages, agentMsg] },
          };

          // 检查评判智能体返回的 COMPLETE（排除 NEEDS_REVISION）
          const msgUpper = data.message.toUpperCase();
          if (
            currentIssue &&
            isJudgeAgent &&
            msgUpper.includes('COMPLETE') &&
            !msgUpper.includes('NEEDS_REVISION')
          ) {
            await handleIssueComplete(afterConfig, currentIssue, headers, t);
          }

          onConfigUpdate(afterConfig);
        }
      } catch (error) {
        log.error('[usePBLChat] Error:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [projectConfig, userRole, currentIssue, isLoading, onConfigUpdate, t],
  );

  return { messages, isLoading, sendMessage, currentIssue };
}

/**
 * 从 @提及中解析目标智能体，或对普通消息回退到问答智能体
 */
function resolveTargetAgent(
  text: string,
  currentIssue: PBLIssue | null,
  agents: PBLAgent[],
): PBLAgent | null {
  if (!currentIssue) return null;

  const mentionMatch = text.match(/^@(\w+)/i);
  if (mentionMatch) {
    const mentionType = mentionMatch[1].toLowerCase();

    if (mentionType === 'question') {
      return agents.find((a) => a.name === currentIssue.question_agent_name) || null;
    }
    if (mentionType === 'judge') {
      return agents.find((a) => a.name === currentIssue.judge_agent_name) || null;
    }

    // 直接提及智能体名称
    const matched = agents.find((a) => a.name.toLowerCase().includes(mentionType));
    if (matched) return matched;
  }

  // 无 @提及或无法识别的提及 → 默认路由到问答智能体
  return agents.find((a) => a.name === currentIssue.question_agent_name) || null;
}

/**
 * 处理问题完成：标记完成、激活下一个、为下一个问题生成问题
 */
async function handleIssueComplete(
  config: PBLProjectConfig,
  completedIssue: PBLIssue,
  headers: Record<string, string>,
  t: (key: string) => string,
) {
  // 标记当前问题为已完成
  const issue = config.issueboard.issues.find((i) => i.id === completedIssue.id);
  if (issue) {
    issue.is_done = true;
    issue.is_active = false;
  }
  config.issueboard.current_issue_id = null;

  // 激活下一个未完成的问题
  const nextIssue = config.issueboard.issues
    .filter((i) => !i.is_done)
    .sort((a, b) => a.index - b.index)[0];

  if (nextIssue) {
    nextIssue.is_active = true;
    config.issueboard.current_issue_id = nextIssue.id;

    // 如果新问题尚未生成问题，则生成
    const questionAgent = config.agents.find((a) => a.name === nextIssue.question_agent_name);
    if (questionAgent && !nextIssue.generated_questions) {
      try {
        const questionPrompt = [
          `## Issue Information`,
          ``,
          `**Title**: ${nextIssue.title}`,
          `**Description**: ${nextIssue.description}`,
          `**Person in Charge**: ${nextIssue.person_in_charge}`,
          nextIssue.participants.length > 0
            ? `**Participants**: ${nextIssue.participants.join(', ')}`
            : '',
          nextIssue.notes ? `**Notes**: ${nextIssue.notes}` : '',
          ``,
          `## Your Task`,
          ``,
          `Based on the issue information above, generate 1-3 specific, actionable questions that will help students understand and complete this issue. Format your response as a numbered list.`,
        ]
          .filter(Boolean)
          .join('\n');

        const resp = await fetch('/api/pbl/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: questionPrompt,
            agent: questionAgent,
            currentIssue: nextIssue,
            recentMessages: [],
            userRole: '',
          }),
        });

        const data = await resp.json();
        if (data.success && data.message) {
          nextIssue.generated_questions = data.message;

          // 添加问答智能体的欢迎消息
          config.chat.messages.push({
            id: `msg_${Date.now()}_welcome`,
            agent_name: nextIssue.question_agent_name,
            message: t('pbl.chat.welcomeMessage')
              .replace('{title}', nextIssue.title)
              .replace('{questions}', data.message),
            timestamp: Date.now(),
            read_by: [],
          });
        }
      } catch (error) {
        log.error('[usePBLChat] Failed to generate questions for next issue:', error);
      }
    } else if (questionAgent && nextIssue.generated_questions) {
      // 问题已存在，只需添加欢迎消息
      config.chat.messages.push({
        id: `msg_${Date.now()}_welcome`,
        agent_name: nextIssue.question_agent_name,
        message: t('pbl.chat.welcomeMessage')
          .replace('{title}', nextIssue.title)
          .replace('{questions}', nextIssue.generated_questions),
        timestamp: Date.now(),
        read_by: [],
      });
    }

    // 关于进展的系统消息
    config.chat.messages.push({
      id: `msg_${Date.now()}_system`,
      agent_name: 'System',
      message: t('pbl.chat.issueCompleteMessage')
        .replace('{completed}', completedIssue.title)
        .replace('{next}', nextIssue.title),
      timestamp: Date.now(),
      read_by: [],
    });
  } else {
    // 所有问题已完成
    config.chat.messages.push({
      id: `msg_${Date.now()}_system`,
      agent_name: 'System',
      message: t('pbl.chat.allCompleteMessage'),
      timestamp: Date.now(),
      read_by: [],
    });
  }
}
