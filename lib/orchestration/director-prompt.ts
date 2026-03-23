/**
 * 导演提示词构建器
 *
 * 为导演智能体构建系统提示词，该智能体决定
 * 在多智能体对话中下一个应该响应的智能体。
 */

import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('DirectorPrompt');

/**
 * 智能体执行的单个白板操作，记录在账本中。
 */
export interface WhiteboardActionRecord {
  actionName:
    | 'wb_draw_text'
    | 'wb_draw_shape'
    | 'wb_draw_chart'
    | 'wb_draw_latex'
    | 'wb_draw_table'
    | 'wb_draw_line'
    | 'wb_clear'
    | 'wb_delete'
    | 'wb_open'
    | 'wb_close';
  agentId: string;
  agentName: string;
  params: Record<string, unknown>;
}

/**
 * 当前轮次中智能体发言的摘要
 */
export interface AgentTurnSummary {
  agentId: string;
  agentName: string;
  contentPreview: string;
  actionCount: number;
  whiteboardActions: WhiteboardActionRecord[];
}

/**
 * 构建导演智能体的系统提示词
 *
 * @param agents - 可用的智能体配置
 * @param conversationSummary - 最近对话的精简摘要
 * @param agentResponses - 本轮已响应的智能体
 * @param turnCount - 本轮当前的轮次编号
 */
export function buildDirectorPrompt(
  agents: AgentConfig[],
  conversationSummary: string,
  agentResponses: AgentTurnSummary[],
  turnCount: number,
  discussionContext?: { topic: string; prompt?: string } | null,
  triggerAgentId?: string | null,
  whiteboardLedger?: WhiteboardActionRecord[],
  userProfile?: { nickname?: string; bio?: string },
  whiteboardOpen?: boolean,
): string {
  const agentList = agents
    .map((a) => `- id: "${a.id}", name: "${a.name}", role: ${a.role}, priority: ${a.priority}`)
    .join('\n');

  const respondedList =
    agentResponses.length > 0
      ? agentResponses
          .map((r) => {
            const wbSummary = summarizeAgentWhiteboardActions(r.whiteboardActions);
            const wbPart = wbSummary ? ` | Whiteboard: ${wbSummary}` : '';
            return `- ${r.agentName} (${r.agentId}): "${r.contentPreview}" [${r.actionCount} actions${wbPart}]`;
          })
          .join('\n')
      : 'None yet.'; // 中文：暂无

  const isDiscussion = !!discussionContext;

  const discussionSection = isDiscussion
    ? `\n# Discussion Mode
Topic: "${discussionContext!.topic}"${discussionContext!.prompt ? `\nPrompt: "${discussionContext!.prompt}"` : ''}${triggerAgentId ? `\nInitiator: "${triggerAgentId}"` : ''}
This is a student-initiated discussion, not a Q&A session.\n`
    : '';

  const rule1 = isDiscussion
    ? `1. The discussion initiator${triggerAgentId ? ` ("${triggerAgentId}")` : ''} should speak first to kick off the topic. Then the teacher responds to guide the discussion. After that, other students may add their perspectives.`
    : "1. The teacher (role: teacher, highest priority) should usually speak first to address the user's question or topic.";

  // 为导演构建白板状态部分
  const whiteboardSection = buildWhiteboardStateForDirector(whiteboardLedger);

  // 为导演构建学生资料部分
  const studentProfileSection =
    userProfile?.nickname || userProfile?.bio
      ? `
# Student Profile
Student name: ${userProfile.nickname || 'Unknown'}
${userProfile.bio ? `Background: ${userProfile.bio}` : ''}
`
      : '';

  return `You are the Director of a multi-agent classroom. Your job is to decide which agent should speak next based on the conversation context.
// 中文：你是多智能体课堂的导演。你的工作是根据对话上下文决定下一个应该发言的智能体。

# Available Agents
${agentList}

# Agents Who Already Spoke This Round
${respondedList}

# Conversation Context
${conversationSummary}
${discussionSection}${whiteboardSection}${studentProfileSection}
# Rules
${rule1}
2. After the teacher, consider whether a student agent would add value (ask a follow-up question, crack a joke, take notes, offer a different perspective).
3. Do NOT repeat an agent who already spoke this round unless absolutely necessary.
4. If the conversation seems complete (question answered, topic covered), output END.
5. Current turn: ${turnCount + 1}. Consider conversation length — don't let discussions drag on unnecessarily.
6. Prefer brevity — 1-2 agents responding is usually enough. Don't force every agent to speak.
7. You can output {"next_agent":"USER"} to cue the user to speak. Use this when a student asks the user a direct question or when the topic naturally calls for user input.
8. Consider whiteboard state when routing: if the whiteboard is already crowded, avoid dispatching agents that are likely to add more whiteboard content unless they would clear or organize it.
9. Whiteboard is currently ${whiteboardOpen ? 'OPEN (slide canvas is hidden — spotlight/laser will not work)' : 'CLOSED (slide canvas is visible)'}. When the whiteboard is open, do not expect spotlight or laser actions to have visible effect.

# Routing Quality (CRITICAL)
- ROLE DIVERSITY: Do NOT dispatch two agents of the same role consecutively. After a teacher speaks, the next should be a student or assistant — not another teacher-like response. After an assistant rephrases, dispatch a student who asks a question, not another assistant who also rephrases.
- CONTENT DEDUP: Read the "Agents Who Already Spoke" previews carefully. If an agent already explained a concept thoroughly, do NOT dispatch another agent to explain the same concept. Instead, dispatch an agent who will ASK a question, CHALLENGE an assumption, CONNECT to another topic, or TAKE NOTES.
- DISCUSSION PROGRESSION: Each new agent should advance the conversation. Good progression: explain → question → deeper explanation → different perspective → summary. Bad progression: explain → re-explain → rephrase → paraphrase.
- GREETING RULE: If any agent has already greeted the students, no subsequent agent should greet again. Check the previews for greetings.

# Output Format
You MUST output ONLY a JSON object, nothing else:
{"next_agent":"<agent_id>"}
or
{"next_agent":"USER"}
or
{"next_agent":"END"}`;
}

/**
 * 将单个智能体的白板操作摘要为紧凑的描述。
 */
function summarizeAgentWhiteboardActions(actions: WhiteboardActionRecord[]): string {
  if (!actions || actions.length === 0) return '';

  const parts: string[] = [];
  for (const a of actions) {
    switch (a.actionName) {
      case 'wb_draw_text': {
        const content = String(a.params.content || '').slice(0, 30);
        parts.push(`drew text "${content}${content.length >= 30 ? '...' : ''}"`);
        break;
      }
      case 'wb_draw_shape':
        parts.push(`drew shape(${a.params.type || 'rectangle'})`);
        break;
      case 'wb_draw_chart': {
        const labels = Array.isArray(a.params.labels)
          ? a.params.labels
          : (a.params.data as Record<string, unknown>)?.labels;
        const chartType = a.params.chartType || a.params.type || 'bar';
        parts.push(
          `drew chart(${chartType}${labels ? `, labels: [${(labels as string[]).slice(0, 4).join(',')}]` : ''})`,
        );
        break;
      }
      case 'wb_draw_latex': {
        const latex = String(a.params.latex || '').slice(0, 30);
        parts.push(`drew formula "${latex}${latex.length >= 30 ? '...' : ''}"`);
        break;
      }
      case 'wb_draw_table': {
        const data = a.params.data as unknown[][] | undefined;
        const rows = data?.length || 0;
        const cols = (data?.[0] as unknown[])?.length || 0;
        parts.push(`drew table(${rows}×${cols})`);
        break;
      }
      case 'wb_draw_line': {
        const pts = a.params.points as string[] | undefined;
        const hasArrow = pts?.includes('arrow') ? ' arrow' : '';
        parts.push(`drew${hasArrow} line`);
        break;
      }
      case 'wb_clear':
        parts.push('CLEARED whiteboard');
        break;
      case 'wb_delete':
        parts.push(`deleted element "${a.params.elementId}"`);
        break;
      case 'wb_open':
      case 'wb_close':
        // 从摘要中跳过 open/close — 它们是结构性的，不是内容
        break;
    }
  }
  return parts.join(', ');
}

/**
 * 重放白板账本以计算当前元素数量和贡献者。
 */
export function summarizeWhiteboardForDirector(ledger: WhiteboardActionRecord[]): {
  elementCount: number;
  contributors: string[];
} {
  let elementCount = 0;
  const contributorSet = new Set<string>();

  for (const record of ledger) {
    if (record.actionName === 'wb_clear') {
      elementCount = 0;
      // 不重置贡献者 — 他们仍然参与过
    } else if (record.actionName === 'wb_delete') {
      elementCount = Math.max(0, elementCount - 1);
    } else if (record.actionName.startsWith('wb_draw_')) {
      elementCount++;
      contributorSet.add(record.agentName);
    }
  }

  return {
    elementCount,
    contributors: Array.from(contributorSet),
  };
}

/**
 * 为导演提示词构建白板状态部分。
 * 如果没有白板操作则返回空字符串。
 */
function buildWhiteboardStateForDirector(ledger?: WhiteboardActionRecord[]): string {
  if (!ledger || ledger.length === 0) return '';

  const { elementCount, contributors } = summarizeWhiteboardForDirector(ledger);
  const crowdedWarning =
    elementCount > 5
      ? '\n⚠ The whiteboard is getting crowded. Consider routing to an agent that will organize or clear it rather than adding more.'
      : '';

  return `
# Whiteboard State
Elements on whiteboard: ${elementCount}
Contributors: ${contributors.length > 0 ? contributors.join(', ') : 'none'}${crowdedWarning}
`;
}

/**
 * 从响应中解析导演的决策
 *
 * @param content - 原始 LLM 响应内容
 * @returns 解析后的决策，包含 nextAgentId 和 shouldEnd 标志
 */
export function parseDirectorDecision(content: string): {
  nextAgentId: string | null;
  shouldEnd: boolean;
} {
  try {
    // 尝试从响应中提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*?"next_agent"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const nextAgent = parsed.next_agent;

      if (!nextAgent || nextAgent === 'END') {
        return { nextAgentId: null, shouldEnd: true };
      }

      return { nextAgentId: nextAgent, shouldEnd: false };
    }
  } catch (_e) {
    log.warn('[Director] Failed to parse decision:', content.slice(0, 200));
  }

  // 默认：如果无法解析则结束本轮
  return { nextAgentId: null, shouldEnd: true };
}
