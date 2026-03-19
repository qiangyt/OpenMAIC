# 多智能体编排模块 (lib/orchestration/)

> 基于 LangGraph 的多智能体对话编排系统，实现"导演"模式协调多个 AI 智能体的发言顺序

## 概览

本模块实现了 OpenMAIC 的多智能体编排逻辑，核心是一个 **导演节点 (Director)** 来决定哪个智能体应该发言，以及何时结束对话或邀请用户发言。

```
┌─────────────────────────────────────────────────────────────────┐
│                    LangGraph 状态图                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   START ──→ director ──(shouldEnd=true)──→ END                 │
│                │                                                │
│                │ (shouldEnd=false, currentAgentId=set)          │
│                ↓                                                │
│         agent_generate ────────→ director (循环)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `director-graph.ts` | LangGraph 状态图定义，包含导演节点和智能体生成节点 |
| `director-prompt.ts` | 导演决策 Prompt 构建和决策解析 |
| `prompt-builder.ts` | 智能体 System Prompt 构建（角色、动作、状态上下文） |
| `tool-schemas.ts` | 动作描述文本，用于注入到 Prompt 中 |
| `stateless-generate.ts` | 无状态生成主入口，流式解析器和生成函数 |
| `ai-sdk-adapter.ts` | AI SDK 适配器，用于 LangGraph 集成 |
| `registry/types.ts` | AgentConfig 类型定义和角色-动作映射 |
| `registry/store.ts` | 智能体配置存储（Zustand） |

## 导演决策机制

### 单智能体模式（纯代码逻辑）

当只有一个智能体时，导演节点**不调用 LLM**，使用固定逻辑：

```typescript
if (isSingleAgent) {
  if (state.turnCount === 0) {
    // 第一轮：派发该智能体
    return { currentAgentId: agentId, shouldEnd: false };
  }
  // 后续轮次：邀请用户发言
  write({ type: 'cue_user', data: { fromAgentId: agentId } });
  return { shouldEnd: true };
}
```

### 多智能体模式（LLM 决策）

当有多个智能体时，导演节点使用 LLM 决策下一个发言者：

**决策 Prompt 结构** (`buildDirectorPrompt`):

```markdown
# Available Agents
- id: "teacher-1", name: "王老师", role: teacher, priority: 10
- id: "student-1", name: "小明", role: student, priority: 5

# Agents Who Already Spoke This Round
- 王老师 (teacher-1): "大家好..." [3 actions]

# Conversation Context
[最近的对话历史摘要]

# Whiteboard State
Elements on whiteboard: 3
Contributors: 王老师, 小明

# Rules
1. 老师通常先发言...
2. 考虑学生是否能补充价值...
3. 不要重复已发言的智能体...
4. 对话完整时输出 END...

# Output Format
{"next_agent":"<agent_id>"} 或 {"next_agent":"USER"} 或 {"next_agent":"END"}
```

**决策解析** (`parseDirectorDecision`):

```typescript
function parseDirectorDecision(content: string) {
  const jsonMatch = content.match(/\{[\s\S]*?"next_agent"[\s\S]*?\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.next_agent === 'END' || !parsed.next_agent) {
      return { nextAgentId: null, shouldEnd: true };
    }
    if (parsed.next_agent === 'USER') {
      // 发送 cue_user 事件
      return { nextAgentId: null, shouldEnd: true };
    }
    return { nextAgentId: parsed.next_agent, shouldEnd: false };
  }
  return { nextAgentId: null, shouldEnd: true }; // 默认结束
}
```

### 快速路径（Fast Paths）

多智能体模式下也有代码快速路径，跳过 LLM 调用：

```typescript
// 第一轮且有触发智能体：直接派发
if (state.turnCount === 0 && state.triggerAgentId) {
  return { currentAgentId: triggerAgentId, shouldEnd: false };
}

// 达到最大轮次：结束
if (state.turnCount >= state.maxTurns) {
  return { shouldEnd: true };
}
```

## 智能体生成节点

### 执行流程 (`runAgentGeneration`)

1. **发送 `agent_start` 事件**
   ```typescript
   write({
     type: 'agent_start',
     data: { messageId, agentId, agentName, agentAvatar, agentColor }
   });
   ```

2. **构建 System Prompt**
   ```typescript
   const systemPrompt = buildStructuredPrompt(
     agentConfig,
     storeState,
     discussionContext,
     whiteboardLedger,
     userProfile,
     agentResponses  // 同轮其他智能体的发言摘要
   );
   ```

3. **流式生成并解析**
   ```typescript
   for await (const chunk of adapter.streamGenerate(messages)) {
     const parseResult = parseStructuredChunk(chunk.content, parserState);

     // 按原始交错顺序发送事件
     for (const entry of parseResult.ordered) {
       if (entry.type === 'text') {
         write({ type: 'text_delta', data: { content: text, messageId } });
       } else if (entry.type === 'action') {
         write({ type: 'action', data: { actionId, actionName, params, agentId } });
       }
     }
   }
   ```

4. **发送 `agent_end` 事件**
   ```typescript
   write({ type: 'agent_end', data: { messageId, agentId } });
   ```

5. **返回本轮摘要**
   ```typescript
   return {
     contentPreview: fullText.slice(0, 300),
     actionCount,
     whiteboardActions  // 用于更新 whiteboardLedger
   };
   ```

## 流式 JSON 解析器

### 设计目标

LLM 输出格式为 JSON 数组，需要增量解析以支持流式响应：

```json
[
  {"type":"action","name":"spotlight","params":{"elementId":"img_1"}},
  {"type":"text","content":"大家好..."},
  {"type":"action","name":"wb_open","params":{}},
  {"type":"text","content":"让我们看这个公式..."}
]
```

### 解析流程 (`parseStructuredChunk`)

```typescript
interface ParserState {
  buffer: string;           // 累积的原始文本
  jsonStarted: boolean;     // 是否已找到 `[`
  lastParsedItemCount: number;  // 已解析的完整项数
  lastPartialTextLength: number; // 尾部部分文本的长度
  isDone: boolean;          // 是否已找到 `]`
}

function parseStructuredChunk(chunk: string, state: ParserState): ParseResult {
  state.buffer += chunk;

  // 1. 跳过 `[` 之前的前缀（markdown 代码块等）
  if (!state.jsonStarted) {
    const bracketIndex = state.buffer.indexOf('[');
    if (bracketIndex === -1) return { textChunks: [], actions: [] };
    state.buffer = state.buffer.slice(bracketIndex);
    state.jsonStarted = true;
  }

  // 2. 检查数组是否闭合
  const isArrayClosed = trimmed.endsWith(']');

  // 3. 解析 JSON（尝试标准解析 → jsonrepair → partial-json）
  let parsed;
  try {
    parsed = JSON.parse(jsonrepair(state.buffer));
  } catch {
    parsed = parsePartialJson(state.buffer, Allow.ARR | Allow.OBJ | ...);
  }

  // 4. 发送新完成的项（数组闭合时全部完成，否则前 N-1 项完成）
  const completeUpTo = isArrayClosed ? parsed.length : Math.max(0, parsed.length - 1);

  for (let i = state.lastParsedItemCount; i < completeUpTo; i++) {
    emitItem(parsed[i], result);
  }

  // 5. 流式发送尾部部分文本的增量
  if (!isArrayClosed && parsed.length > completeUpTo) {
    const lastItem = parsed[parsed.length - 1];
    if (lastItem?.type === 'text') {
      const newContent = lastItem.content.slice(state.lastPartialTextLength);
      if (newContent) result.textChunks.push(newContent);
      state.lastPartialTextLength = lastItem.content.length;
    }
  }

  return result;
}
```

### 容错策略

| 解析器 | 使用场景 |
|--------|----------|
| `JSON.parse` | 标准完整 JSON |
| `jsonrepair` | 修复常见错误（中文引号、未转义字符） |
| `partial-json` | 解析不完整的 JSON（流式响应中途） |

## System Prompt 构建

### Prompt 结构 (`buildStructuredPrompt`)

```markdown
# Role
你是小明。

## Your Personality
你是一个活泼好动的高中生，喜欢问问题...

## Your Classroom Role
[角色特定的职责说明]

# Student Profile
你正在教张三。
他的背景：计算机专业大三学生

# This Round's Context (CRITICAL)
以下智能体已经在本轮发言：
- 王老师: "光合作用是..." [3 actions]

你必须：
1. 不要重复问候...
2. 不要重复已解释的内容...
3. 添加新价值...

# Language (CRITICAL)
你必须用中文（简体）发言。

# Output Format
[{"type":"action","name":"...","params":{...}},{"type":"text","content":"..."}]

## Format Rules
1. 输出单个 JSON 数组
2. type:"action" 包含 name 和 params
3. type:"text" 包含 content
4. 动作和文本可自由交错

## Speech Guidelines (CRITICAL)
- 文本内容是你【说出来的话】
- 不要说"让我添加..."、"我将创建..."
- 永远不要使用 markdown 格式

## Length & Style (CRITICAL)
- 保持总语音文本约 50 字符（1-2 句话）

# Whiteboard Guidelines
[白板使用规则，按角色定制]

# Available Actions
- wb_draw_text: 添加文本到白板...
- wb_draw_latex: 添加 LaTeX 公式...

# Current State
Mode: playback
Whiteboard: closed
Course: 光合作用 - 植物如何将光能转化为化学能
Current slide elements (5):
  1. [id:title] text: "光合作用" at (50,30)
  2. [id:img_1] image: diagram.png at (100,100) size 400x300
  ...
```

### 角色指南 (`ROLE_GUIDELINES`)

```typescript
const ROLE_GUIDELINES = {
  teacher: `你的角色：主讲老师
    - 控制课程流程、幻灯片和节奏
    - 使用 spotlight/laser 引导注意力
    - 使用白板绘制图表和公式
    从不宣布你的动作——自然地教学`,

  assistant: `你的角色：助教
    - 支持老师，填补空白
    - 用更简单的术语重新解释
    - 起辅助作用，不要主导课程`,

  student: `你的角色：学生
    - 积极参与讨论
    - 提问、分享观察
    - 保持简短（最多 1-2 句话）
    - 你不是老师——回复应该比老师短得多`
};
```

### 长度指南（按角色）

| 角色 | 目标长度 | 风格要求 |
|------|----------|----------|
| teacher | ~100 字符 | 启发式教学，提问胜过讲解 |
| assistant | ~80 字符 | 补充角度，不重复老师 |
| student | ~50 字符 | 1-2 句话，快速反应 |

## 智能体配置

### AgentConfig 类型

```typescript
interface AgentConfig {
  id: string;              // 唯一标识
  name: string;            // 显示名称
  role: 'teacher' | 'assistant' | 'student';
  persona: string;         // 完整性格描述
  avatar: string;          // Emoji 或 URL
  color: string;           // UI 主题色
  allowedActions: string[]; // 允许的动作类型
  priority: number;        // 导演选择优先级 (1-10)

  // 元数据
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;      // 是否默认模板

  // LLM 生成的智能体
  isGenerated?: boolean;
  boundStageId?: string;   // 绑定的舞台 ID
}
```

### 角色-动作映射

```typescript
const WHITEBOARD_ACTIONS = [
  'wb_open', 'wb_close', 'wb_draw_text', 'wb_draw_shape',
  'wb_draw_chart', 'wb_draw_latex', 'wb_draw_table',
  'wb_draw_line', 'wb_clear', 'wb_delete'
];

const SLIDE_ACTIONS = ['spotlight', 'laser', 'play_video'];

const ROLE_ACTIONS = {
  teacher: [...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS],
  assistant: [...WHITEBOARD_ACTIONS],
  student: [...WHITEBOARD_ACTIONS]
};
```

### 请求作用域配置

生成的智能体配置随请求传递，不存储在服务器：

```typescript
// 客户端请求携带 agentConfigs
const request: StatelessChatRequest = {
  messages: [...],
  config: {
    agentIds: ['teacher-1', 'generated-1'],
    agentConfigs: [
      { id: 'generated-1', name: '李华', role: 'student', ... }
    ]
  }
};

// 服务端解析
function resolveAgent(state, agentId) {
  // 优先使用请求作用域配置
  return state.agentConfigOverrides[agentId]
    ?? useAgentRegistry.getState().getAgent(agentId);
}
```

## 白板状态追踪

### WhiteboardActionRecord

记录每个智能体的白板操作，用于构建虚拟白板状态：

```typescript
interface WhiteboardActionRecord {
  actionName: 'wb_draw_text' | 'wb_draw_shape' | 'wb_draw_chart' | ...;
  agentId: string;
  agentName: string;
  params: Record<string, unknown>;
}
```

### 白板状态摘要

导演和智能体都可以看到当前白板状态：

```typescript
function summarizeWhiteboardForDirector(ledger: WhiteboardActionRecord[]) {
  let elementCount = 0;
  const contributorSet = new Set<string>();

  for (const record of ledger) {
    if (record.actionName === 'wb_clear') {
      elementCount = 0;
    } else if (record.actionName === 'wb_delete') {
      elementCount--;
    } else if (record.actionName.startsWith('wb_draw_')) {
      elementCount++;
      contributorSet.add(record.agentName);
    }
  }

  return { elementCount, contributors: [...contributorSet] };
}
```

### 虚拟白板上下文

智能体可以看到本轮其他智能体绘制的元素：

```markdown
## Whiteboard Changes This Round (IMPORTANT)
Other agents have modified the whiteboard during this discussion round.
Current whiteboard elements (3):
  1. [by 王老师] text: "Step 1: 6CO₂ + 6H₂O" at (100,100), size ~400x100
  2. [by 王老师] latex: "\frac{-b \pm \sqrt{b^2-4ac}}{2a}" at (100,250), size ~500x80
  3. [by 小明] shape(rectangle) at (100,400), size 200x100

DO NOT redraw content that already exists.
```

## 事件流 (StatelessEvent)

### 事件类型

```typescript
type StatelessEvent =
  | { type: 'thinking'; data: { stage: 'director' | 'agent_loading'; agentId?: string } }
  | { type: 'agent_start'; data: { messageId, agentId, agentName, agentAvatar, agentColor } }
  | { type: 'text_delta'; data: { content: string; messageId: string } }
  | { type: 'action'; data: { actionId, actionName, params, agentId, messageId } }
  | { type: 'agent_end'; data: { messageId, agentId } }
  | { type: 'cue_user'; data: { fromAgentId?: string } }
  | { type: 'done'; data: { totalActions, totalAgents, agentHadContent, directorState } }
  | { type: 'error'; data: { message: string } };
```

### SSE 流式传输

```typescript
// API 端点返回 SSE 流
export async function POST(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for await (const event of statelessGenerate(chatRequest, signal, model)) {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                      lib/orchestration/                         │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/types/chat.ts (StatelessChatRequest, StatelessEvent)    │
│  - lib/types/action.ts (Action, SLIDE_ONLY_ACTIONS)            │
│  - lib/types/provider.ts (ThinkingConfig)                      │
│  - @langchain/langgraph (StateGraph, Annotation)               │
│  - @langchain/core/messages (SystemMessage, HumanMessage...)   │
│  - ai (LanguageModel)                                          │
│  - partial-json (流式 JSON 解析)                                │
│  - jsonrepair (JSON 修复)                                       │
│                                                                 │
│  被依赖:                                                        │
│  - app/api/chat/route.ts (多智能体聊天 API)                     │
│  - app/api/pbl/chat/route.ts (PBL 聊天 API)                    │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用 LangGraph？

1. **声明式状态管理**：状态变更清晰可见，易于调试
2. **条件边**：`directorCondition` 根据 `shouldEnd` 决定流转方向
3. **自定义流模式**：`streamMode: 'custom'` 允许节点推送任意事件
4. **内置信号支持**：`AbortSignal` 传递到所有节点

### 为什么单智能体不调用 LLM？

1. **节省成本**：导演 LLM 调用没有实际价值
2. **降低延迟**：直接派发，无需等待 LLM 响应
3. **确定性**：行为可预测，便于调试

### 为什么使用 JSON 数组格式？

1. **交错顺序**：动作和文本可以任意交错，保持自然的教学节奏
2. **增量解析**：支持 `partial-json` 流式解析
3. **单一响应**：避免多轮 tool-call 循环

### 为什么白板状态用 ledger 追踪？

1. **无需持久化**：ledger 随请求传递，服务端无状态
2. **可回放**：可以精确重建任意时刻的白板状态
3. **归因**：每个元素都知道是谁绘制的
