# PBL 项目式学习模块 (lib/pbl/)

> Project-Based Learning (PBL) 场景生成引擎

## 概览

本模块实现了 PBL（项目式学习）场景的 AI 驱动生成。通过 Agentic Loop 让 LLM 调用工具来设计完整的 PBL 项目配置，包括项目信息、智能体角色、任务看板等。

```
┌─────────────────────────────────────────────────────────────────┐
│                        PBL Generation                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   用户输入                                                      │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ projectTopic: "设计一个环保主题的校园活动"               │  │
│   │ targetSkills: ["协作", "研究", "创意思维"]               │  │
│   │ issueCount: 5                                            │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │               Agentic Loop (generateText)               │  │
│   │                                                         │  │
│   │   LLM ─────► Tool Calls ─────► MCP Classes ─────► State │  │
│   │    ▲                                        │           │  │
│   │    └────────────────────────────────────────┘           │  │
│   │                                                         │  │
│   │   Tools: set_mode, create_project, add_agent,           │  │
│   │          create_issue, assign_issue, ...                │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│   输出: PBLProjectConfig                                        │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ projectInfo: { title, description }                     │  │
│   │ agents: [ Agent1, Agent2, ... ]                         │  │
│   │ issueboard: { issues: [...], current_issue_id }         │  │
│   │ chat: { messages: [] }                                  │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `types.ts` | PBL 类型定义 |
| `generate-pbl.ts` | PBL 生成主函数（Agentic Loop） |
| `pbl-system-prompt.ts` | PBL 系统提示词 |
| `mcp/mode-mcp.ts` | 模式切换 MCP |
| `mcp/project-mcp.ts` | 项目信息 MCP |
| `mcp/agent-mcp.ts` | 智能体管理 MCP |
| `mcp/issueboard-mcp.ts` | 任务看板 MCP |
| `mcp/agent-templates.ts` | 智能体模板 |

## 类型定义 (types.ts)

### 核心类型

```typescript
// PBL 模式
type PBLMode = 'project_info' | 'agent' | 'issueboard' | 'idle';

// 项目信息
interface PBLProjectInfo {
  title: string;
  description: string;
}

// 角色分工类型
type PBLRoleDivision = 'management' | 'development';

// 智能体定义
interface PBLAgent {
  name: string;
  actor_role: string;           // 角色名称
  role_division: PBLRoleDivision;
  system_prompt: string;        // 系统提示词
  default_mode: string;
  delay_time: number;           // 发言延迟
  env: Record<string, unknown>;
  is_user_role: boolean;        // 是否是用户扮演的角色
  is_active: boolean;
  is_system_agent: boolean;
}

// 任务/议题
interface PBLIssue {
  id: string;
  title: string;
  description: string;
  person_in_charge: string;     // 负责人
  participants: string[];       // 参与者
  notes: string;
  parent_issue: string | null;  // 父任务
  index: number;
  is_done: boolean;
  is_active: boolean;
  generated_questions: string;
  question_agent_name: string;
  judge_agent_name: string;
}

// 任务看板
interface PBLIssueboard {
  agent_ids: string[];
  issues: PBLIssue[];
  current_issue_id: string | null;
}

// 聊天消息
interface PBLChatMessage {
  id: string;
  agent_name: string;
  message: string;
  timestamp: number;
  read_by: string[];
}

// 项目配置（完整输出）
interface PBLProjectConfig {
  projectInfo: PBLProjectInfo;
  agents: PBLAgent[];
  issueboard: PBLIssueboard;
  chat: PBLChat;
  selectedRole?: string | null;
}
```

## 生成函数 (generate-pbl.ts)

### 使用方式

```typescript
import { generatePBLContent, type GeneratePBLConfig } from '@/lib/pbl/generate-pbl';
import { getModel } from '@/lib/ai/providers';

// 配置参数
const config: GeneratePBLConfig = {
  projectTopic: '设计一个环保主题的校园活动',
  projectDescription: '让学生通过团队合作设计和组织环保活动',
  targetSkills: ['协作能力', '研究能力', '创意思维', '沟通能力'],
  issueCount: 5,  // 生成的任务数量
  language: 'zh-CN',
};

// 获取模型
const model = getModel({
  providerId: 'openai',
  modelId: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
});

// 生成 PBL 项目
const projectConfig = await generatePBLContent(config, model, {
  onProgress: (message) => console.log(message),
});

// 输出结果
console.log('项目名称:', projectConfig.projectInfo.title);
console.log('智能体数量:', projectConfig.agents.length);
console.log('任务数量:', projectConfig.issueboard.issues.length);
```

### 生成流程

```
generatePBLContent(config, model)
       │
       ├── 1. 初始化共享状态
       │      projectConfig = { projectInfo, agents, issueboard, chat }
       │
       ├── 2. 创建 MCP 实例
       │      modeMCP, projectMCP, agentMCP, issueboardMCP
       │
       ├── 3. 定义 AI SDK Tools
       │      - set_mode
       │      - get_project_info / set_project_info
       │      - list_agents / add_agent / update_agent
       │      - list_issues / create_issue / update_issue / assign_issue
       │      - generate_issues_from_skills
       │      - finish_generation
       │
       ├── 4. Agentic Loop
       │      generateText({
       │        model,
       │        tools: pblTools,
       │        maxSteps: 50,
       │        stopWhen: stepCountIs(50) or finish_generation called,
       │      })
       │
       └── 5. 返回 projectConfig
```

### 可用工具

| 工具名 | 说明 | MCP 类 |
|--------|------|--------|
| `set_mode` | 切换工作模式 | ModeMCP |
| `get_project_info` | 获取项目信息 | ProjectMCP |
| `set_project_info` | 设置项目信息 | ProjectMCP |
| `list_agents` | 列出所有智能体 | AgentMCP |
| `add_agent` | 添加智能体 | AgentMCP |
| `update_agent` | 更新智能体 | AgentMCP |
| `list_issues` | 列出所有任务 | IssueboardMCP |
| `create_issue` | 创建任务 | IssueboardMCP |
| `update_issue` | 更新任务 | IssueboardMCP |
| `assign_issue` | 分配任务负责人 | IssueboardMCP |
| `generate_issues_from_skills` | 根据技能生成任务 | IssueboardMCP |
| `finish_generation` | 完成生成 | - |

## MCP 类

### ModeMCP (mcp/mode-mcp.ts)

```typescript
// 管理当前工作模式
class ModeMCP {
  constructor(modes: PBLMode[], initialMode: PBLMode);

  setMode(mode: PBLMode): PBLToolResult;
  getMode(): PBLMode;
}
```

### ProjectMCP (mcp/project-mcp.ts)

```typescript
// 管理项目信息
class ProjectMCP {
  constructor(config: PBLProjectConfig);

  getProjectInfo(): PBLToolResult;
  setProjectInfo(info: PBLProjectInfo): PBLToolResult;
}
```

### AgentMCP (mcp/agent-mcp.ts)

```typescript
// 管理智能体
class AgentMCP {
  constructor(config: PBLProjectConfig);

  listAgents(): PBLToolResult;
  addAgent(agent: PBLAgent): PBLToolResult;
  updateAgent(name: string, updates: Partial<PBLAgent>): PBLToolResult;
  getAgent(name: string): PBLAgent | undefined;
}
```

### IssueboardMCP (mcp/issueboard-mcp.ts)

```typescript
// 管理任务看板
class IssueboardMCP {
  constructor(
    config: PBLProjectConfig,
    agentMCP: AgentMCP,
    language: string
  );

  listIssues(): PBLToolResult;
  createIssue(issue: Omit<PBLIssue, 'id' | 'index'>): PBLToolResult;
  updateIssue(id: string, updates: Partial<PBLIssue>): PBLToolResult;
  assignIssue(id: string, agentName: string): PBLToolResult;
  generateIssuesFromSkills(skills: string[]): PBLToolResult;
}
```

## 智能体模板 (mcp/agent-templates.ts)

```typescript
// 预定义的智能体模板
export const AGENT_TEMPLATES = {
  // 项目经理
  project_manager: {
    actor_role: '项目经理',
    role_division: 'management',
    system_prompt: '你负责项目的整体规划、协调和进度管理...',
    default_mode: 'coordination',
    delay_time: 1000,
  },

  // 开发者
  developer: {
    actor_role: '开发者',
    role_division: 'development',
    system_prompt: '你负责技术实现和代码开发...',
    default_mode: 'working',
    delay_time: 1500,
  },

  // 研究员
  researcher: {
    actor_role: '研究员',
    role_division: 'development',
    system_prompt: '你负责调研和分析...',
    default_mode: 'research',
    delay_time: 2000,
  },

  // 质量保证
  qa: {
    actor_role: '质量保证',
    role_division: 'development',
    system_prompt: '你负责测试和质量控制...',
    default_mode: 'review',
    delay_time: 1200,
  },
};
```

## 系统提示词 (pbl-system-prompt.ts)

```typescript
import { buildPBLSystemPrompt } from '@/lib/pbl/pbl-system-prompt';

// 构建 PBL 生成系统提示词
const systemPrompt = buildPBLSystemPrompt(config, language);

// 提示词结构
// 1. 角色定义：你是 PBL 项目设计专家
// 2. 目标：设计完整的 PBL 项目配置
// 3. 可用工具列表和使用说明
// 4. 生成流程建议
// 5. 质量要求
// 6. 用户需求和约束
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/pbl/                                 │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - ai (Vercel AI SDK - generateText, tool, zod)                │
│  - lib/ai/llm.ts (callLLM)                                     │
│  - lib/types/generation.ts (PBL 相关类型)                      │
│                                                                 │
│  被依赖:                                                        │
│  - app/api/generate/pbl/route.ts (PBL 生成 API)               │
│  - components/pbl/* (PBL 组件)                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用 Agentic Loop？

1. **复杂任务**: PBL 项目设计需要多步骤思考
2. **工具调用**: LLM 需要调用多个 MCP 工具
3. **状态管理**: 共享状态需要在工具间传递
4. **可控性**: 通过 stopWhen 控制终止条件

### 为什么使用 MCP 类而非纯函数？

1. **状态封装**: MCP 类持有共享状态引用
2. **职责分离**: 每个 MCP 负责特定领域
3. **可测试**: MCP 类可以独立测试
4. **扩展性**: 易于添加新的 MCP 类

### 为什么区分 management 和 development 角色？

1. **角色分工**: 管理者和执行者职责不同
2. **任务分配**: 根据角色类型分配任务
3. **协作模式**: 不同角色有不同的协作方式

### 为什么有 delay_time？

1. **对话自然性**: 模拟真实对话的延迟
2. **阅读时间**: 给用户阅读时间
3. **角色差异**: 不同角色有不同的响应速度
