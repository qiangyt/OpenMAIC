/**
 * PBL 生成 - 使用 Vercel AI SDK 的智能体循环
 *
 * 核心生成引擎，通过 generateText + stopWhen 的多步工具调用
 * 设计完整的 PBL 项目。
 *
 * 使用 Vercel AI SDK 替代 PBL-Nano 的 Anthropic SDK 直接调用，
 * 以实现多模型兼容。
 */

import { tool, stepCountIs } from 'ai';
import { callLLM } from '@/lib/ai/llm';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { PBLProjectConfig } from './types';
import { ModeMCP } from './mcp/mode-mcp';
import { ProjectMCP } from './mcp/project-mcp';
import { AgentMCP } from './mcp/agent-mcp';
import { IssueboardMCP } from './mcp/issueboard-mcp';
import { buildPBLSystemPrompt } from './pbl-system-prompt';
import type { PBLMode } from './types';

export interface GeneratePBLConfig {
  projectTopic: string;
  projectDescription: string;
  targetSkills: string[];
  issueCount?: number;
  language: string;
}

export interface GeneratePBLCallbacks {
  onProgress?: (message: string) => void;
}

/**
 * 使用智能体循环生成完整的 PBL 项目配置。
 *
 * 使用 Vercel AI SDK 的 generateText 配合 tools 和 stopWhen
 * 驱动多步对话，让 LLM 通过调用 MCP 工具设计项目。
 */
export async function generatePBLContent(
  config: GeneratePBLConfig,
  model: LanguageModel,
  callbacks?: GeneratePBLCallbacks,
): Promise<PBLProjectConfig> {
  const { language } = config;

  // 初始化共享状态
  const projectConfig: PBLProjectConfig = {
    projectInfo: { title: '', description: '' },
    agents: [],
    issueboard: { agent_ids: [], issues: [], current_issue_id: null },
    chat: { messages: [] },
  };

  // 创建操作共享状态的 MCP 实例
  const modeMCP = new ModeMCP(
    ['project_info', 'agent', 'issueboard', 'idle'] as PBLMode[],
    'project_info' as PBLMode,
  );
  const projectMCP = new ProjectMCP(projectConfig);
  const agentMCP = new AgentMCP(projectConfig);
  const issueboardMCP = new IssueboardMCP(projectConfig, agentMCP, language);

  callbacks?.onProgress?.('Starting PBL project generation...');

  // 使用 Zod schemas 定义工具，委托给 MCP 实例
  const pblTools = {
    set_mode: tool({
      description:
        'Switch the current working mode. Available modes: project_info, agent, issueboard, idle.', // 中文：切换当前工作模式。可用模式：project_info（项目信息）、agent（智能体）、issueboard（任务看板）、idle（空闲）。
      inputSchema: z.object({
        mode: z.enum(['project_info', 'agent', 'issueboard', 'idle']),
      }),
      execute: async ({ mode }) => modeMCP.setMode(mode as PBLMode),
    }),

    // 项目信息工具
    get_project_info: tool({
      description:
        'Get the current project information (title and description). Requires project_info mode.', // 中文：获取当前项目信息（标题和描述）。需要 project_info 模式。
      inputSchema: z.object({}),
      execute: async () => {
        if (modeMCP.getCurrentMode() !== 'project_info') {
          return { success: false, error: 'Must be in project_info mode.' }; // 中文：必须在 project_info 模式下。
        }
        return projectMCP.getProjectInfo();
      },
    }),
    update_title: tool({
      description: 'Update the project title. Requires project_info mode.', // 中文：更新项目标题。需要 project_info 模式。
      inputSchema: z.object({
        title: z.string().describe('The new project title'), // 中文：新的项目标题
      }),
      execute: async ({ title }) => {
        if (modeMCP.getCurrentMode() !== 'project_info') {
          return { success: false, error: 'Must be in project_info mode.' }; // 中文：必须在 project_info 模式下。
        }
        return projectMCP.updateTitle(title);
      },
    }),
    update_description: tool({
      description: 'Update the project description. Requires project_info mode.', // 中文：更新项目描述。需要 project_info 模式。
      inputSchema: z.object({
        description: z.string().describe('The new project description'), // 中文：新的项目描述
      }),
      execute: async ({ description }) => {
        if (modeMCP.getCurrentMode() !== 'project_info') {
          return { success: false, error: 'Must be in project_info mode.' }; // 中文：必须在 project_info 模式下。
        }
        return projectMCP.updateDescription(description);
      },
    }),

    // 智能体工具
    list_project_agents: tool({
      description: 'List all agent roles defined for the project. Requires agent mode.', // 中文：列出项目中定义的所有智能体角色。需要 agent 模式。
      inputSchema: z.object({}),
      execute: async () => {
        if (modeMCP.getCurrentMode() !== 'agent') {
          return { success: false, error: 'Must be in agent mode.' }; // 中文：必须在 agent 模式下。
        }
        return agentMCP.listAgents();
      },
    }),
    create_agent: tool({
      description: 'Create a new agent role for the project. Requires agent mode.', // 中文：为项目创建新的智能体角色。需要 agent 模式。
      inputSchema: z.object({
        name: z.string().describe('Agent name (e.g., "Data Analyst", "Project Manager")'), // 中文：智能体名称（如"数据分析师"、"项目经理"）
        system_prompt: z.string().describe("System prompt describing the agent's responsibilities"), // 中文：描述智能体职责的系统提示词
        default_mode: z.string().describe('Default environment mode (e.g., "chat")'), // 中文：默认环境模式（如"chat"）
        actor_role: z.string().optional().describe('Role description'), // 中文：角色描述
        role_division: z
          .enum(['management', 'development'])
          .optional()
          .describe('Role division (default: development)'), // 中文：角色分工（默认：development）
      }),
      execute: async (params) => {
        if (modeMCP.getCurrentMode() !== 'agent') {
          return { success: false, error: 'Must be in agent mode.' }; // 中文：必须在 agent 模式下。
        }
        return agentMCP.createAgent(params);
      },
    }),
    update_agent: tool({
      description: "Update an agent role's properties. Requires agent mode.", // 中文：更新智能体角色的属性。需要 agent 模式。
      inputSchema: z.object({
        name: z.string().describe('The agent name to update'), // 中文：要更新的智能体名称
        new_name: z.string().optional().describe('New agent name'), // 中文：新的智能体名称
        system_prompt: z.string().optional().describe('New system prompt'), // 中文：新的系统提示词
        default_mode: z.string().optional().describe('New default mode'), // 中文：新的默认模式
        actor_role: z.string().optional().describe('New role description'), // 中文：新的角色描述
        role_division: z.enum(['management', 'development']).optional(),
      }),
      execute: async (params) => {
        if (modeMCP.getCurrentMode() !== 'agent') {
          return { success: false, error: 'Must be in agent mode.' }; // 中文：必须在 agent 模式下。
        }
        return agentMCP.updateAgent(params);
      },
    }),
    delete_agent: tool({
      description: 'Delete an agent role. Requires agent mode.', // 中文：删除智能体角色。需要 agent 模式。
      inputSchema: z.object({
        name: z.string().describe('The agent name to delete'), // 中文：要删除的智能体名称
      }),
      execute: async ({ name }) => {
        if (modeMCP.getCurrentMode() !== 'agent') {
          return { success: false, error: 'Must be in agent mode.' }; // 中文：必须在 agent 模式下。
        }
        return agentMCP.deleteAgent(name);
      },
    }),

    // 任务看板工具
    create_issueboard: tool({
      description: 'Create/reset the issueboard. Requires issueboard mode.', // 中文：创建/重置任务看板。需要 issueboard 模式。
      inputSchema: z.object({}),
      execute: async () => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.createIssueboard();
      },
    }),
    get_issueboard: tool({
      description: 'Get the current issueboard configuration. Requires issueboard mode.', // 中文：获取当前任务看板配置。需要 issueboard 模式。
      inputSchema: z.object({}),
      execute: async () => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.getIssueboard();
      },
    }),
    update_issueboard_agents: tool({
      description: 'Update the agent list for the issueboard. Requires issueboard mode.', // 中文：更新任务看板的智能体列表。需要 issueboard 模式。
      inputSchema: z.object({
        agent_ids: z.array(z.string()).describe('List of agent names to assign'), // 中文：要分配的智能体名称列表
      }),
      execute: async ({ agent_ids }) => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.updateIssueboardAgents(agent_ids);
      },
    }),
    create_issue: tool({
      description:
        'Create a new issue in the issueboard. Automatically creates Question and Judge agents. Requires issueboard mode.', // 中文：在任务看板中创建新任务。自动创建提问助手和评判助手。需要 issueboard 模式。
      inputSchema: z.object({
        title: z.string().describe('Issue title'), // 中文：任务标题
        description: z.string().describe('Issue description'), // 中文：任务描述
        person_in_charge: z.string().describe('Person responsible (use an agent role name)'), // 中文：负责人（使用智能体角色名称）
        participants: z.array(z.string()).optional().describe('Participant names'), // 中文：参与者名称
        notes: z.string().optional().describe('Additional notes'), // 中文：附加备注
        parent_issue: z.string().nullable().optional().describe('Parent issue ID for sub-issues'), // 中文：子任务的父任务 ID
        index: z.number().optional().describe('Order index'), // 中文：排序索引
      }),
      execute: async (params) => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.createIssue(params);
      },
    }),
    list_issues: tool({
      description: 'List all issues in the issueboard. Requires issueboard mode.', // 中文：列出任务看板中的所有任务。需要 issueboard 模式。
      inputSchema: z.object({}),
      execute: async () => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.listIssues();
      },
    }),
    update_issue: tool({
      description: 'Update an existing issue. Requires issueboard mode.', // 中文：更新现有任务。需要 issueboard 模式。
      inputSchema: z.object({
        issue_id: z.string().describe('The issue ID to update'), // 中文：要更新的任务 ID
        title: z.string().optional(),
        description: z.string().optional(),
        person_in_charge: z.string().optional(),
        participants: z.array(z.string()).optional(),
        notes: z.string().optional(),
        parent_issue: z.string().nullable().optional(),
        index: z.number().optional(),
      }),
      execute: async (params) => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.updateIssue(params);
      },
    }),
    delete_issue: tool({
      description: 'Delete an issue and its sub-issues. Requires issueboard mode.', // 中文：删除任务及其子任务。需要 issueboard 模式。
      inputSchema: z.object({
        issue_id: z.string().describe('The issue ID to delete'), // 中文：要删除的任务 ID
      }),
      execute: async ({ issue_id }) => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.deleteIssue(issue_id);
      },
    }),
    reorder_issues: tool({
      description: 'Reorder issues. Requires issueboard mode.', // 中文：重新排序任务。需要 issueboard 模式。
      inputSchema: z.object({
        issue_ids: z.array(z.string()).describe('Issue IDs in desired order'), // 中文：按期望顺序排列的任务 ID
      }),
      execute: async ({ issue_ids }) => {
        if (modeMCP.getCurrentMode() !== 'issueboard') {
          return { success: false, error: 'Must be in issueboard mode.' }; // 中文：必须在 issueboard 模式下。
        }
        return issueboardMCP.reorderIssues(issue_ids);
      },
    }),
  };

  // 运行智能体循环
  const systemPrompt = buildPBLSystemPrompt(config);

  const _result = await callLLM(
    {
      model,
      system: systemPrompt,
      prompt:
        language === 'zh-CN'
          ? `请设计一个PBL项目。现在从 project_info 模式开始，先设置项目标题和描述。`
          : `Design a PBL project. Start in project_info mode by setting the project title and description.`,
      tools: pblTools,
      stopWhen: stepCountIs(30),
      onStepFinish: ({ toolCalls, text }) => {
        if (text) {
          callbacks?.onProgress?.(`Thinking: ${text.slice(0, 100)}...`);
        }
        if (toolCalls) {
          for (const tc of toolCalls) {
            callbacks?.onProgress?.(`Tool: ${tc.toolName}`);
          }
        }
      },
    },
    'pbl-generate',
  );

  // 检查是否达到 idle 模式；如果没有，LLM 可能提前停止了
  if (modeMCP.getCurrentMode() !== 'idle') {
    callbacks?.onProgress?.(
      'Warning: Generation did not reach idle mode. Project may be incomplete.',
    );
  }

  callbacks?.onProgress?.('PBL structure generated. Running post-processing...');

  // 后处理：激活第一个任务并生成初始问题
  await postProcessPBL(projectConfig, model, language, callbacks);

  callbacks?.onProgress?.('PBL project generation complete!');

  return projectConfig;
}

/**
 * 智能体循环后的后处理：
 * 1. 激活第一个任务
 * 2. 使用提问助手为其生成初始问题
 * 3. 添加欢迎消息到聊天
 */
async function postProcessPBL(
  config: PBLProjectConfig,
  model: LanguageModel,
  language: string,
  callbacks?: GeneratePBLCallbacks,
): Promise<void> {
  const { issueboard, agents } = config;

  if (issueboard.issues.length === 0) {
    return;
  }

  // 按 index 排序并激活第一个
  const sortedIssues = [...issueboard.issues].sort((a, b) => a.index - b.index);
  const firstIssue = sortedIssues[0];
  firstIssue.is_active = true;
  issueboard.current_issue_id = firstIssue.id;

  callbacks?.onProgress?.(`Activating first issue: ${firstIssue.title}`);

  // 为第一个任务生成初始问题
  const questionAgent = agents.find((a) => a.name === firstIssue.question_agent_name);
  if (!questionAgent) {
    callbacks?.onProgress?.('Warning: Question agent not found for first issue.');
    return;
  }

  try {
    callbacks?.onProgress?.('Generating initial questions for first issue...');

    const context =
      language === 'zh-CN'
        ? `## 任务信息

**标题**: ${firstIssue.title}
**描述**: ${firstIssue.description}
**负责人**: ${firstIssue.person_in_charge}
${firstIssue.participants.length > 0 ? `**参与者**: ${firstIssue.participants.join('、')}` : ''}
${firstIssue.notes ? `**备注**: ${firstIssue.notes}` : ''}

## 你的任务

根据以上任务信息，生成1-3个具体、可操作的引导问题，帮助学生理解和完成这个任务。每个问题应：
- 引导学生达成关键学习目标
- 具体且可操作
- 帮助分解问题
- 鼓励批判性思考

请以编号列表格式回答。`
        : `## Issue Information

**Title**: ${firstIssue.title}
**Description**: ${firstIssue.description}
**Person in Charge**: ${firstIssue.person_in_charge}
${firstIssue.participants.length > 0 ? `**Participants**: ${firstIssue.participants.join(', ')}` : ''}
${firstIssue.notes ? `**Notes**: ${firstIssue.notes}` : ''}

## Your Task

Based on the issue information above, generate 1-3 specific, actionable questions that will help students understand and complete this issue. Each question should:
- Guide students toward key learning objectives
- Be specific and actionable
- Help break down the problem
- Encourage critical thinking

Format your response as a numbered list.`;

    const questionResult = await callLLM(
      {
        model,
        system: questionAgent.system_prompt,
        prompt: context,
      },
      'pbl-post-process',
    );

    const generatedQuestions = questionResult.text;
    firstIssue.generated_questions = generatedQuestions;

    // 添加欢迎消息到聊天
    const welcomeMessage =
      language === 'zh-CN'
        ? `你好！我是这个任务的提问助手："${firstIssue.title}"\n\n为了引导你的学习，我准备了一些问题：\n\n${generatedQuestions}\n\n随时 @question 我来获取帮助或澄清！`
        : `Hello! I'm your Question Agent for this issue: "${firstIssue.title}"\n\nTo help guide your work, I've prepared some questions for you:\n\n${generatedQuestions}\n\nFeel free to @question me anytime if you need help or clarification!`;

    config.chat.messages.push({
      id: `msg_welcome_${Date.now()}`,
      agent_name: firstIssue.question_agent_name,
      message: welcomeMessage,
      timestamp: Date.now(),
      read_by: [],
    });

    callbacks?.onProgress?.('Initial questions generated and welcome message added.');
  } catch (error) {
    callbacks?.onProgress?.(
      `Warning: Failed to generate initial questions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
