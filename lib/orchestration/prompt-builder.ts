/**
 * 无状态生成的提示词构建器
 *
 * 为 LLM 构建系统提示词并转换消息格式。
 */

import type { StatelessChatRequest } from '@/lib/types/chat';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import type { WhiteboardActionRecord, AgentTurnSummary } from './director-prompt';
import { getActionDescriptions, getEffectiveActions } from './tool-schemas';

// ==================== 角色指南 ====================

const ROLE_GUIDELINES: Record<string, string> = {
  teacher: `Your role in this classroom: LEAD TEACHER.
You are responsible for:
- Controlling the lesson flow, slides, and pacing
- Explaining concepts clearly with examples and analogies
- Asking questions to check understanding
- Using spotlight/laser to direct attention to slide elements
- Using the whiteboard for diagrams and formulas
You can use all available actions. Never announce your actions — just teach naturally.`,
  // 中文：你在课堂中的角色：主讲老师。
  // 你负责：
  // - 控制课程流程、幻灯片和节奏
  // - 用示例和类比清晰地解释概念
  // - 提问以检查理解程度
  // - 使用聚光灯/激光笔引导注意力到幻灯片元素
  // - 使用白板绘制图表和公式
  // 你可以使用所有可用动作。永远不要宣布你的动作 — 自然地教学即可。

  assistant: `Your role in this classroom: TEACHING ASSISTANT.
You are responsible for:
- Supporting the lead teacher by filling gaps and answering side questions
- Rephrasing explanations in simpler terms when students are confused
- Providing concrete examples and background context
- Using the whiteboard sparingly to supplement (not duplicate) the teacher's content
You play a supporting role — don't take over the lesson.`,
  // 中文：你在课堂中的角色：助教。
  // 你负责：
  // - 通过填补空白和回答附带问题来支持主讲老师
  // - 当学生困惑时用更简单的术语重新表述解释
  // - 提供具体示例和背景上下文
  // - 节制地使用白板来补充（而非重复）老师的内容
  // 你扮演辅助角色 — 不要接管课程。

  student: `Your role in this classroom: STUDENT.
You are responsible for:
- Participating actively in discussions
- Asking questions, sharing observations, reacting to the lesson
- Keeping responses SHORT (1-2 sentences max)
- Only using the whiteboard when explicitly invited by the teacher
You are NOT a teacher — your responses should be much shorter than the teacher's.`,
  // 中文：你在课堂中的角色：学生。
  // 你负责：
  // - 积极参与讨论
  // - 提问、分享观察、对课程做出反应
  // - 保持回答简短（最多 1-2 句话）
  // - 仅在老师明确邀请时使用白板
  // 你不是老师 — 你的回答应该比老师的短得多。
};

// ==================== 类型定义 ====================

/**
 * 智能体发起讨论的讨论上下文
 */
interface DiscussionContext {
  topic: string;
  prompt?: string;
}

// ==================== 同伴上下文 ====================

/**
 * 构建总结本轮其他智能体发言内容的上下文部分。
 * 如果还没有智能体发言则返回空字符串。
 */
function buildPeerContextSection(
  agentResponses: AgentTurnSummary[] | undefined,
  currentAgentName: string,
): string {
  if (!agentResponses || agentResponses.length === 0) return '';

  // 过滤掉自己（防御性 — 导演不应两次调度同一智能体）
  const peers = agentResponses.filter((r) => r.agentName !== currentAgentName);
  if (peers.length === 0) return '';

  const peerLines = peers.map((r) => `- ${r.agentName}: "${r.contentPreview}"`).join('\n');

  return `
# This Round's Context (CRITICAL — READ BEFORE RESPONDING)
The following agents have already spoken in this discussion round:
${peerLines}

You are ${currentAgentName}, responding AFTER the agents above. You MUST:
1. NOT repeat greetings or introductions — they have already been made
2. NOT restate what previous speakers already explained
3. Add NEW value from YOUR unique perspective as ${currentAgentName}
4. Build on, question, or extend what was said — do not echo it
5. If you agree with a previous point, say so briefly and then ADD something new
`;
}

// ==================== 系统提示词 ====================

/**
 * 为结构化输出生成构建系统提示词
 *
 * @param agentConfig - 智能体配置
 * @param storeState - 当前应用状态
 * @param discussionContext - 可选的讨论上下文，用于智能体发起的讨论
 * @returns 系统提示词字符串
 */
export function buildStructuredPrompt(
  agentConfig: AgentConfig,
  storeState: StatelessChatRequest['storeState'],
  discussionContext?: DiscussionContext,
  whiteboardLedger?: WhiteboardActionRecord[],
  userProfile?: { nickname?: string; bio?: string },
  agentResponses?: AgentTurnSummary[],
): string {
  // 根据场景类型确定当前场景类型以进行动作过滤
  const currentScene = storeState.currentSceneId
    ? storeState.scenes.find((s) => s.id === storeState.currentSceneId)
    : undefined;
  const sceneType = currentScene?.type;

  // 按场景类型过滤动作（spotlight/laser 仅在幻灯片上可用）
  const effectiveActions = getEffectiveActions(agentConfig.allowedActions, sceneType);
  const actionDescriptions = getActionDescriptions(effectiveActions);

  // 构建关于当前状态的上下文
  const stateContext = buildStateContext(storeState);

  // 从账本构建虚拟白板上下文（显示本轮其他智能体的更改）
  const virtualWbContext = buildVirtualWhiteboardContext(storeState, whiteboardLedger);

  // 构建学生资料部分（仅当有昵称或简介时）
  const studentProfileSection =
    userProfile?.nickname || userProfile?.bio
      ? `\n# Student Profile
You are teaching ${userProfile.nickname || 'a student'}.${userProfile.bio ? `\nTheir background: ${userProfile.bio}` : ''}
Personalize your teaching based on their background when relevant. Address them by name naturally.\n`
      : '';

  // 构建同伴上下文部分（本轮智能体已说的内容）
  const peerContext = buildPeerContextSection(agentResponses, agentConfig.name);

  // spotlight/laser 是否可用（仅在幻灯片场景）
  const hasSlideActions =
    effectiveActions.includes('spotlight') || effectiveActions.includes('laser');

  // 根据可用动作构建格式示例
  const formatExample = hasSlideActions
    ? `[{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},{"type":"text","content":"Your natural speech to students"}]`
    : `[{"type":"action","name":"wb_open","params":{}},{"type":"text","content":"Your natural speech to students"}]`;

  // 排序原则
  const orderingPrinciples = hasSlideActions
    ? `- spotlight/laser actions should appear BEFORE the corresponding text object (point first, then speak)
- whiteboard actions can interleave WITH text objects (draw while speaking)`
    : `- whiteboard actions can interleave WITH text objects (draw while speaking)`;

  // 良好示例 — 仅在幻灯片场景包含 spotlight/laser 示例
  const spotlightExamples = hasSlideActions
    ? `[{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},{"type":"text","content":"Photosynthesis is the process by which plants convert light energy into chemical energy. Take a look at this diagram."},{"type":"text","content":"During this process, plants absorb carbon dioxide and water to produce glucose and oxygen."}]

[{"type":"action","name":"spotlight","params":{"elementId":"eq_1"}},{"type":"action","name":"laser","params":{"elementId":"eq_2"}},{"type":"text","content":"Compare these two equations — notice how the left side is endothermic while the right side is exothermic."}]

`
    : '';

  // 动作使用指南 — 条件性的 spotlight/laser 行
  const slideActionGuidelines = hasSlideActions
    ? `- spotlight: Use to focus attention on ONE key element. Don't overuse — max 1-2 per response.
- laser: Use to point at elements. Good for directing attention during explanations.
`
    : '';

  const mutualExclusionNote = hasSlideActions
    ? `- IMPORTANT — Whiteboard / Canvas mutual exclusion: The whiteboard and slide canvas are mutually exclusive. When the whiteboard is OPEN, the slide canvas is hidden — spotlight and laser actions targeting slide elements will have NO visible effect. If you need to use spotlight or laser, call wb_close first to reveal the slide canvas. Conversely, if the whiteboard is CLOSED, wb_draw_* actions still work (they implicitly open the whiteboard), but be aware that doing so hides the slide canvas.
- Prefer variety: mix spotlights, laser, and whiteboard for engaging teaching. Don't use the same action type repeatedly.`
    : '';

  const roleGuideline = ROLE_GUIDELINES[agentConfig.role] || ROLE_GUIDELINES.student;

  // 从课程语言构建语言约束
  const courseLanguage = storeState.stage?.language;
  const languageConstraint = courseLanguage
    ? `\n# Language (CRITICAL)\nYou MUST speak in ${courseLanguage === 'zh-CN' ? 'Chinese (Simplified)' : courseLanguage === 'en-US' ? 'English' : courseLanguage}. ALL text content in your response MUST be in this language.\n`
    : '';

  return `# Role
You are ${agentConfig.name}.

## Your Personality
${agentConfig.persona}

## Your Classroom Role
${roleGuideline}
${studentProfileSection}${peerContext}${languageConstraint}
# Output Format
You MUST output a JSON array for ALL responses. Each element is an object with a \`type\` field:

${formatExample}

## Format Rules
1. Output a single JSON array — no explanation, no code fences
2. \`type:"action"\` objects contain \`name\` and \`params\`
3. \`type:"text"\` objects contain \`content\` (speech text)
4. Action and text objects can freely interleave in any order
5. The \`]\` closing bracket marks the end of your response
6. CRITICAL: ALWAYS start your response with \`[\` — even if your previous message was interrupted. Never continue a partial response as plain text. Every response must be a complete, independent JSON array.

## Ordering Principles
${orderingPrinciples}

## Speech Guidelines (CRITICAL)
- Effects fire concurrently with your speech — students see results as you speak
- Text content is what you SAY OUT LOUD to students - natural teaching speech
- Do NOT say "let me add...", "I'll create...", "now I'm going to..."
- Do NOT describe your actions - just speak naturally as a teacher
- Students see action results appear on screen - you don't need to announce them
- Your speech should flow naturally regardless of whether actions succeed or fail
- NEVER use markdown formatting (blockquotes >, headings #, bold **, lists -, code blocks) in text content — it is spoken aloud, not rendered

## Length & Style (CRITICAL)
${buildLengthGuidelines(agentConfig.role)}

### Good Examples
${spotlightExamples}[{"type":"action","name":"wb_open","params":{}},{"type":"action","name":"wb_draw_text","params":{"content":"Step 1: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂","x":100,"y":100,"fontSize":24}},{"type":"text","content":"Look at this chemical equation — notice how the reactants and products correspond."}]

[{"type":"action","name":"wb_open","params":{}},{"type":"action","name":"wb_draw_latex","params":{"latex":"\\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}","x":100,"y":80,"width":500}},{"type":"text","content":"This is the quadratic formula — it can solve any quadratic equation."},{"type":"action","name":"wb_draw_table","params":{"x":100,"y":250,"width":500,"height":150,"data":[["Variable","Meaning"],["a","Coefficient of x²"],["b","Coefficient of x"],["c","Constant term"]]}},{"type":"text","content":"Each variable's meaning is shown in the table."}]

### Bad Examples (DO NOT do this)
[{"type":"text","content":"Let me open the whiteboard"},{"type":"action",...}] (Don't announce actions!)
[{"type":"text","content":"I'm going to draw a diagram for you..."}] (Don't describe what you're doing!)
[{"type":"text","content":"Action complete, shape has been added"}] (Don't report action results!)

## Whiteboard Guidelines
${buildWhiteboardGuidelines(agentConfig.role)}

# Available Actions
${actionDescriptions}

## Action Usage Guidelines
${slideActionGuidelines}- Whiteboard actions (wb_open, wb_draw_text, wb_draw_shape, wb_draw_chart, wb_draw_latex, wb_draw_table, wb_draw_line, wb_delete, wb_clear, wb_close): Use when explaining concepts that benefit from diagrams, formulas, data charts, tables, connecting lines, or step-by-step derivations. Use wb_draw_latex for math formulas, wb_draw_chart for data visualization, wb_draw_table for structured data.
- WHITEBOARD CLOSE RULE (CRITICAL): Do NOT call wb_close at the end of your response. Leave the whiteboard OPEN so students can read what you drew. Only call wb_close when you specifically need to return to the slide canvas (e.g., to use spotlight or laser on slide elements). Frequent open/close is distracting.
- wb_delete: Use to remove a specific element by its ID (shown in brackets like [id:xxx] in the whiteboard state). Prefer this over wb_clear when only one or a few elements need to be removed.
${mutualExclusionNote}

# Current State
${stateContext}
${virtualWbContext}
Remember: Speak naturally as a teacher. Effects fire concurrently with your speech.${
    discussionContext
      ? agentResponses && agentResponses.length > 0
        ? `

# Discussion Context
Topic: "${discussionContext.topic}"
${discussionContext.prompt ? `Guiding prompt: ${discussionContext.prompt}` : ''}

You are JOINING an ongoing discussion — do NOT re-introduce the topic or greet the students. The discussion has already started. Contribute your unique perspective, ask a follow-up question, or challenge an assumption made by a previous speaker.`
        : `

# Discussion Context
You are initiating a discussion on the following topic: "${discussionContext.topic}"
${discussionContext.prompt ? `Guiding prompt: ${discussionContext.prompt}` : ''}

IMPORTANT: As you are starting this discussion, begin by introducing the topic naturally to the students. Engage them and invite their thoughts. Do not wait for user input - you speak first.`
      : ''
  }`;
}

// ==================== 长度指南 ====================

/**
 * 构建基于角色的长度和风格指南。
 *
 * 所有智能体都应该简洁和对话式。学生智能体必须比老师
 * 明显更短，以避免盖过老师的角色。
 */
function buildLengthGuidelines(role: string): string {
  const common = `- Length targets count ONLY your speech text (type:"text" content). Actions (spotlight, whiteboard, etc.) do NOT count toward length. Use as many actions as needed — they don't make your speech "too long."
- Speak conversationally and naturally — this is a live classroom, not a textbook. Use oral language, not written prose.`;

  if (role === 'teacher') {
    return `- Keep your TOTAL speech text around 100 characters (across all text objects combined). Prefer 2-3 short sentences over one long paragraph.
${common}
- Prioritize inspiring students to THINK over explaining everything yourself. Ask questions, pose challenges, give hints — don't just lecture.
- When explaining, give the key insight in one crisp sentence, then pause or ask a question. Avoid exhaustive explanations.`;
  }

  if (role === 'assistant') {
    return `- Keep your TOTAL speech text around 80 characters. You are a supporting role — be brief.
${common}
- One key point per response. Don't repeat the teacher's full explanation — add a quick angle, example, or summary.`;
  }

  // 学生角色 — 必须明显比老师短
  return `- Keep your TOTAL speech text around 50 characters. 1-2 sentences max.
${common}
- You are a STUDENT, not a teacher. Your responses should be much shorter than the teacher's. If your response is as long as the teacher's, you are doing it wrong.
- Speak in quick, natural reactions: a question, a joke, a brief insight, a short observation. Not paragraphs.
- Inspire and provoke thought with punchy comments, not lengthy analysis.`;
}

// ==================== 白板指南 ====================

/**
 * 构建基于角色的白板指南。
 *
 * - 老师 / 助教：完整的白板自由，带有去重和协调规则。
 * - 学生：白板是选择加入的 — 仅在老师明确邀请时使用
 *   （例如"来黑板上解这道题"），从不主动使用。
 */
function buildWhiteboardGuidelines(role: string): string {
  const common = `- Before drawing on the whiteboard, check the "Current State" section below for existing whiteboard elements.
- Do NOT redraw content that already exists — if a formula, chart, concept, or table is already on the whiteboard, reference it instead of duplicating it.
- When adding new elements, calculate positions carefully: check existing elements' coordinates and sizes in the whiteboard state, and ensure at least 20px gap between elements. Canvas size is 1000×562. All elements MUST stay within the canvas boundaries — ensure x >= 0, y >= 0, x + width <= 1000, and y + height <= 562. Never place elements that extend beyond the edges.
- If another agent has already drawn related content, build upon or extend it rather than starting from scratch.`;

  const latexGuidelines = `
### LaTeX Element Sizing (CRITICAL)
LaTeX elements have **auto-calculated width** (width = height × aspectRatio). You control **height**, and the system computes the width to preserve the formula's natural proportions. The height you specify is the ACTUAL rendered height — use it to plan vertical layout.

**Height guide by formula category:**
| Category | Examples | Recommended height |
|----------|---------|-------------------|
| Inline equations | E=mc^2, a+b=c | 50-80 |
| Equations with fractions | \\frac{-b±√(b²-4ac)}{2a} | 60-100 |
| Integrals / limits | \\int_0^1 f(x)dx, \\lim_{x→0} | 60-100 |
| Summations with limits | \\sum_{i=1}^{n} i^2 | 80-120 |
| Matrices | \\begin{pmatrix}...\\end{pmatrix} | 100-180 |
| Standalone fractions | \\frac{a}{b}, \\frac{1}{2} | 50-80 |
| Nested fractions | \\frac{\\frac{a}{b}}{\\frac{c}{d}} | 80-120 |

**Key rules:**
- ALWAYS specify height. The height you set is the actual rendered height.
- When placing elements below each other, add height + 20-40px gap.
- Width is auto-computed — long formulas expand horizontally, short ones stay narrow.
- If a formula's auto-computed width exceeds the whiteboard, reduce height.

**Multi-step derivations:**
Give each step the **same height** (e.g., 70-80px). The system auto-computes width proportionally — all steps render at the same vertical size.

### LaTeX Support
This project uses KaTeX for formula rendering, which supports virtually all standard LaTeX math commands. You may use any standard LaTeX math command freely.

- \\text{} can render English text. For non-Latin labels, use a separate TextElement.`;

  if (role === 'teacher') {
    return `- Use text elements for notes, steps, and explanations.
- Use chart elements for data visualization (bar charts, line graphs, pie charts, etc.).
- Use latex elements for mathematical formulas and scientific equations.
- Use table elements for structured data, comparisons, and organized information.
- Use shape elements sparingly — only for simple diagrams. Do not add large numbers of meaningless shapes.
- Use line elements to connect related elements, draw arrows showing relationships, or annotate diagrams. Specify arrow markers via the points parameter.
- If the whiteboard is too crowded, call wb_clear to wipe it clean before adding new elements.

### Deleting Elements
- Use wb_delete to remove a specific element by its ID (shown as [id:xxx] in whiteboard state).
- Prefer wb_delete over wb_clear when only 1-2 elements need removal.
- Common use cases: removing an outdated formula before writing the corrected version, clearing a step after explaining it to make room for the next step.

### Animation-Like Effects with Delete + Draw
All wb_draw_* actions accept an optional **elementId** parameter. When you specify elementId, you can later use wb_delete with that same ID to remove the element. This is essential for creating animation effects.
- To use: add elementId (e.g. "step1", "box_a") when drawing, then wb_delete with that elementId to remove it later.
- Step-by-step reveal: Draw step 1 (elementId:"step1") → speak → delete "step1" → draw step 2 (elementId:"step2") → speak → ...
- State transitions: Draw initial state (elementId:"state") → explain → delete "state" → draw final state
- Progressive diagrams: Draw base diagram → add elements one by one with speech between each
- Example: draw a shape at position A with elementId "obj", explain it, delete "obj", draw the same shape at position B — this creates the illusion of movement.
- Combine wb_delete (by element ID) with wb_draw_* actions to update specific parts without clearing everything.

### Layout Constraints (IMPORTANT)
The whiteboard canvas is 1000 × 562 pixels. Follow these rules to prevent element overlap:

**Coordinate system:**
- X range: 0 (left) to 1000 (right), Y range: 0 (top) to 562 (bottom)
- Leave 20px margin from edges (safe area: x 20-980, y 20-542)

**Spacing rules:**
- Maintain at least 20px gap between adjacent elements
- Vertical stacking: next_y = previous_y + previous_height + 30
- Side by side: next_x = previous_x + previous_width + 30

**Layout patterns:**
- Top-down flow: Start from y=30, stack downward with gaps
- Two-column: Left column x=20-480, right column x=520-980
- Center single element: x = (1000 - element_width) / 2

**Before adding a new element:**
- Check existing elements' positions in the whiteboard state
- Ensure your new element's bounding box does not overlap with any existing element
- If space is insufficient, use wb_delete to remove unneeded elements or wb_clear to start fresh
${latexGuidelines}
${common}`;
  }

  if (role === 'assistant') {
    return `- The whiteboard is primarily the teacher's space. As an assistant, use it sparingly to supplement.
- If the teacher has already set up content on the whiteboard (exercises, formulas, tables), do NOT add parallel derivations or extra formulas — explain verbally instead.
- Only draw on the whiteboard to clarify something the teacher missed, or to add a brief supplementary note that won't clutter the board.
- Limit yourself to at most 1-2 small elements per response. Prefer speech over drawing.
${latexGuidelines}
${common}`;
  }

  // 学生角色：抑制主动使用白板
  return `- The whiteboard is primarily the teacher's space. Do NOT draw on it proactively.
- Only use whiteboard actions when the teacher or user explicitly invites you to write on the board (e.g., "come solve this", "show your work on the whiteboard").
- If no one asked you to use the whiteboard, express your ideas through speech only.
- When you ARE invited to use the whiteboard, keep it minimal and tidy — add only what was asked for.
${common}`;
}

// ==================== 元素摘要 ====================

/**
 * 去除 HTML 标签以提取纯文本
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * 将单个 PPT 元素摘要为单行描述
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PPTElement 变体具有异构形状
function summarizeElement(el: any): string {
  const id = el.id ? `[id:${el.id}]` : '';
  const pos = `at (${Math.round(el.left)},${Math.round(el.top)})`;
  const size =
    el.width != null && el.height != null
      ? ` size ${Math.round(el.width)}×${Math.round(el.height)}`
      : el.width != null
        ? ` w=${Math.round(el.width)}`
        : '';

  switch (el.type) {
    case 'text': {
      const text = stripHtml(el.content || '').slice(0, 60);
      const suffix = text.length >= 60 ? '...' : '';
      return `${id} text${el.textType ? `[${el.textType}]` : ''}: "${text}${suffix}" ${pos}${size}`;
    }
    case 'image': {
      const src = el.src?.startsWith('data:') ? '[embedded]' : el.src?.slice(0, 50) || 'unknown';
      return `${id} image: ${src} ${pos}${size}`;
    }
    case 'shape': {
      const shapeText = el.text?.content ? stripHtml(el.text.content).slice(0, 40) : '';
      return `${id} shape${shapeText ? `: "${shapeText}"` : ''} ${pos}${size}`;
    }
    case 'chart':
      return `${id} chart[${el.chartType}]: labels=[${(el.data?.labels || []).slice(0, 4).join(',')}] ${pos}${size}`;
    case 'table': {
      const rows = el.data?.length || 0;
      const cols = el.data?.[0]?.length || 0;
      return `${id} table: ${rows}x${cols} ${pos}${size}`;
    }
    case 'latex':
      return `${id} latex: "${(el.latex || '').slice(0, 40)}" ${pos}${size}`;
    case 'line': {
      const lx = Math.round(el.left ?? 0);
      const ly = Math.round(el.top ?? 0);
      const sx = el.start?.[0] ?? 0;
      const sy = el.start?.[1] ?? 0;
      const ex = el.end?.[0] ?? 0;
      const ey = el.end?.[1] ?? 0;
      return `${id} line: (${lx + sx},${ly + sy}) → (${lx + ex},${ly + ey})`;
    }
    case 'video':
      return `${id} video ${pos}${size}`;
    case 'audio':
      return `${id} audio ${pos}${size}`;
    default:
      return `${id} ${el.type || 'unknown'} ${pos}${size}`;
  }
}

/**
 * 将元素数组摘要为行描述
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PPTElement 变体具有异构形状
function summarizeElements(elements: any[]): string {
  if (elements.length === 0) return '  (empty)'; // 中文：(空)

  const lines = elements.map((el, i) => `  ${i + 1}. ${summarizeElement(el)}`);

  return lines.join('\n');
}

// ==================== 虚拟白板上下文 ====================

/**
 * 从重放白板账本跟踪的元素
 */
interface VirtualWhiteboardElement {
  agentName: string;
  summary: string;
  elementId?: string; // 来自初始白板状态的元素存在此字段
}

/**
 * 重放白板账本以构建带归属的元素列表。
 *
 * - wb_clear 重置累积的元素
 * - wb_draw_* 追加一个带有智能体名称的新元素
 * - wb_open / wb_close 被忽略（结构性的，不是内容）
 *
 * 当账本为空时返回空字符串（零额外令牌开销）。
 */
function buildVirtualWhiteboardContext(
  storeState: StatelessChatRequest['storeState'],
  ledger?: WhiteboardActionRecord[],
): string {
  if (!ledger || ledger.length === 0) return '';

  // 重放账本以构建当前元素列表
  const elements: VirtualWhiteboardElement[] = [];

  for (const record of ledger) {
    switch (record.actionName) {
      case 'wb_clear':
        elements.length = 0;
        break;
      case 'wb_delete': {
        // 通过匹配初始白板状态的 elementId 来移除元素
        // （本轮绘制的元素没有跟踪的 ID）
        const deleteId = String(record.params.elementId || '');
        const idx = elements.findIndex((el) => el.elementId === deleteId);
        if (idx >= 0) elements.splice(idx, 1);
        break;
      }
      case 'wb_draw_text': {
        const content = String(record.params.content || '').slice(0, 40);
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 400;
        const h = record.params.height ?? 100;
        elements.push({
          agentName: record.agentName,
          summary: `text: "${content}${content.length >= 40 ? '...' : ''}" at (${x},${y}), size ~${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_shape': {
        const shapeType = record.params.type || record.params.shape || 'rectangle';
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 100;
        const h = record.params.height ?? 100;
        elements.push({
          agentName: record.agentName,
          summary: `shape(${shapeType}) at (${x},${y}), size ${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_chart': {
        const chartType = record.params.chartType || record.params.type || 'bar';
        const labels = Array.isArray(record.params.labels)
          ? record.params.labels
          : (record.params.data as Record<string, unknown>)?.labels;
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 350;
        const h = record.params.height ?? 250;
        elements.push({
          agentName: record.agentName,
          summary: `chart(${chartType})${labels ? `: labels=[${(labels as string[]).slice(0, 4).join(',')}]` : ''} at (${x},${y}), size ${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_latex': {
        const latex = String(record.params.latex || '').slice(0, 40);
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 400;
        // 估计 latex 高度：单行约 80px，复杂公式更多
        const h = record.params.height ?? 80;
        elements.push({
          agentName: record.agentName,
          summary: `latex: "${latex}${latex.length >= 40 ? '...' : ''}" at (${x},${y}), size ~${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_table': {
        const data = record.params.data as unknown[][] | undefined;
        const rows = data?.length || 0;
        const cols = (data?.[0] as unknown[])?.length || 0;
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 400;
        const h = record.params.height ?? rows * 40 + 20;
        elements.push({
          agentName: record.agentName,
          summary: `table(${rows}×${cols}) at (${x},${y}), size ${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_line': {
        const sx = record.params.startX ?? '?';
        const sy = record.params.startY ?? '?';
        const ex = record.params.endX ?? '?';
        const ey = record.params.endY ?? '?';
        const pts = record.params.points as string[] | undefined;
        const hasArrow = pts?.includes('arrow') ? ' (arrow)' : '';
        elements.push({
          agentName: record.agentName,
          summary: `line${hasArrow}: (${sx},${sy}) → (${ex},${ey})`,
        });
        break;
      }
      // wb_open, wb_close — 跳过
    }
  }

  if (elements.length === 0) return '';

  const elementLines = elements
    .map((el, i) => `  ${i + 1}. [by ${el.agentName}] ${el.summary}`)
    .join('\n');

  return `
## Whiteboard Changes This Round (IMPORTANT)
Other agents have modified the whiteboard during this discussion round.
Current whiteboard elements (${elements.length}):
${elementLines}

DO NOT redraw content that already exists. Check positions above before adding new elements.
`;
}

// ==================== 状态上下文 ====================

/**
 * 从 store 状态构建上下文字符串
 */
function buildStateContext(storeState: StatelessChatRequest['storeState']): string {
  const { stage, scenes, currentSceneId, mode, whiteboardOpen } = storeState;

  const lines: string[] = [];

  // 模式
  lines.push(`Mode: ${mode}`);

  // 白板状态
  lines.push(
    `Whiteboard: ${whiteboardOpen ? 'OPEN (slide canvas is hidden)' : 'closed (slide canvas is visible)'}`,
  );

  // 课程信息
  if (stage) {
    lines.push(
      `Course: ${stage.name || 'Untitled'}${stage.description ? ` - ${stage.description}` : ''}`,
    );
  }

  // 场景摘要
  lines.push(`Total scenes: ${scenes.length}`);

  if (currentSceneId) {
    const currentScene = scenes.find((s) => s.id === currentSceneId);
    if (currentScene) {
      lines.push(
        `Current scene: "${currentScene.title}" (${currentScene.type}, id: ${currentSceneId})`,
      );

      // 幻灯片场景：包含元素详情
      if (currentScene.content.type === 'slide') {
        const elements = currentScene.content.canvas.elements;
        lines.push(`Current slide elements (${elements.length}):\n${summarizeElements(elements)}`);
      }

      // 测验场景：包含问题摘要
      if (currentScene.content.type === 'quiz') {
        const questions = currentScene.content.questions;
        const qSummary = questions
          .slice(0, 5)
          .map((q, i) => `  ${i + 1}. [${q.type}] ${q.question.slice(0, 80)}`)
          .join('\n');
        lines.push(
          `Quiz questions (${questions.length}):\n${qSummary}${questions.length > 5 ? `\n  ... and ${questions.length - 5} more` : ''}`,
        );
      }
    }
  } else if (scenes.length > 0) {
    lines.push('No scene currently selected'); // 中文：当前未选择场景
  }

  // 列出前几个场景
  if (scenes.length > 0) {
    const sceneSummary = scenes
      .slice(0, 5)
      .map((s, i) => `  ${i + 1}. ${s.title} (${s.type}, id: ${s.id})`)
      .join('\n');
    lines.push(
      `Scenes:\n${sceneSummary}${scenes.length > 5 ? `\n  ... and ${scenes.length - 5} more` : ''}`,
    );
  }

  // 白板内容（课程中最后一个白板）
  if (stage?.whiteboard && stage.whiteboard.length > 0) {
    const lastWb = stage.whiteboard[stage.whiteboard.length - 1];
    const wbElements = lastWb.elements || [];
    lines.push(
      `Whiteboard (last of ${stage.whiteboard.length}, ${wbElements.length} elements):\n${summarizeElements(wbElements)}`,
    );
  }

  return lines.join('\n');
}

// ==================== 对话摘要 ====================

/**
 * OpenAI 消息格式（由导演使用）
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 为导演智能体摘要对话历史
 *
 * 生成最近 N 条消息的精简文本摘要，
 * 截断长消息并包含角色标签。
 *
 * @param messages - 要摘要的 OpenAI 格式消息
 * @param maxMessages - 要包含的最大最近消息数（默认 10）
 * @param maxContentLength - 每条消息的最大内容长度（默认 200）
 */
export function summarizeConversation(
  messages: OpenAIMessage[],
  maxMessages = 10,
  maxContentLength = 200,
): string {
  if (messages.length === 0) {
    return 'No conversation history yet.'; // 中文：暂无对话历史
  }

  const recent = messages.slice(-maxMessages);
  const lines = recent.map((msg) => {
    const roleLabel =
      msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    const content =
      msg.content.length > maxContentLength
        ? msg.content.slice(0, maxContentLength) + '...'
        : msg.content;
    return `[${roleLabel}] ${content}`;
  });

  return lines.join('\n');
}

// ==================== 消息转换 ====================

/**
 * 将 UI 消息转换为 OpenAI 格式
 * 包含工具调用信息，以便模型知道执行了哪些动作
 */
export function convertMessagesToOpenAI(
  messages: StatelessChatRequest['messages'],
  currentAgentId?: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => {
      if (msg.role === 'assistant') {
        // 助手消息使用 JSON 数组格式，作为与系统提示词中
        // 期望输出格式匹配的少样本示例
        const items: Array<{ type: string; [key: string]: string }> = [];

        if (msg.parts) {
          for (const part of msg.parts) {
            const p = part as Record<string, unknown>;

            if (p.type === 'text' && p.text) {
              items.push({ type: 'text', content: p.text as string });
            } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
              const actionName = (p.actionName ||
                (p.type as string).replace('action-', '')) as string;
              const output = p.output as Record<string, unknown> | undefined;
              const isSuccess = output?.success === true;
              const resultSummary = isSuccess
                ? output?.data
                  ? `result: ${JSON.stringify(output.data).slice(0, 100)}`
                  : 'success'
                : (output?.error as string) || 'failed';
              items.push({
                type: 'action',
                name: actionName,
                result: resultSummary,
              });
            }
          }
        }

        const content = items.length > 0 ? JSON.stringify(items) : '';
        const msgAgentId = msg.metadata?.agentId;

        // 当提供了 currentAgentId 且此消息来自不同智能体时，
        // 转换为带有智能体名称归属的 user 角色
        if (currentAgentId && msgAgentId && msgAgentId !== currentAgentId) {
          const agentName = msg.metadata?.senderName || msgAgentId;
          return {
            role: 'user' as const,
            content: content ? `[${agentName}]: ${content}` : '',
          };
        }

        return {
          role: 'assistant' as const,
          content,
        };
      }

      // 用户消息：保持纯文本连接
      const contentParts: string[] = [];

      if (msg.parts) {
        for (const part of msg.parts) {
          const p = part as Record<string, unknown>;

          if (p.type === 'text' && p.text) {
            contentParts.push(p.text as string);
          } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
            const actionName = (p.actionName ||
              (p.type as string).replace('action-', '')) as string;
            const output = p.output as Record<string, unknown> | undefined;
            const isSuccess = output?.success === true;
            const resultSummary = isSuccess
              ? output?.data
                ? `result: ${JSON.stringify(output.data).slice(0, 100)}`
                : 'success'
              : (output?.error as string) || 'failed';
            contentParts.push(`[Action ${actionName}: ${resultSummary}]`);
          }
        }
      }

      // 从元数据中提取说话者名称（例如讨论中其他智能体的消息）
      const senderName = msg.metadata?.senderName;
      let content = contentParts.join('\n');
      if (senderName) {
        content = `[${senderName}]: ${content}`;
      }

      // 为被中断的消息添加注释，以便 LLM 知道上下文被截断了
      const isInterrupted =
        (msg as unknown as Record<string, unknown>).metadata &&
        ((msg as unknown as Record<string, unknown>).metadata as Record<string, unknown>)
          ?.interrupted;
      return {
        role: 'user' as const,
        content: isInterrupted
          ? `${content}\n[This response was interrupted — do NOT continue it. Start a new JSON array response.]`
          : content,
      };
    })
    .filter((msg) => {
      // 丢弃空消息和只有点/省略号/空白的消息
      // （由失败的智能体流产生）
      const stripped = msg.content.replace(/[.\s…]+/g, '');
      return stripped.length > 0;
    });
}
