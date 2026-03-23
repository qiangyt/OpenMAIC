/**
 * 智能体配置类型
 * 定义多智能体系统中可配置 AI 智能体的结构
 */

export interface AgentConfig {
  id: string; // 唯一智能体 ID
  name: string; // 显示名称（中文）
  role: string; // 简短角色描述
  persona: string; // 完整系统提示词（个性、职责）
  avatar: string; // Emoji 或图片 URL
  color: string; // UI 主题颜色（十六进制）
  allowedActions: string[]; // 此智能体可使用的动作类型
  priority: number; // 导演选择的优先级（1-10）

  // 元数据
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean; // 是否为默认模板？

  // LLM 生成的智能体字段
  isGenerated?: boolean; // 对于 LLM 生成的智能体为 true
  boundStageId?: string; // 此智能体为之生成的阶段 ID
}

export interface AgentTemplate {
  // 与 AgentConfig 相同，但没有 id/dates（用于创建新智能体）
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  allowedActions: string[];
  priority: number;

  // LLM 生成的智能体字段
  isGenerated?: boolean; // 对于 LLM 生成的智能体为 true
  boundStageId?: string; // 此智能体为之生成的阶段 ID
}

/**
 * 从模板创建新的 AgentConfig
 */
export function createAgentFromTemplate(template: AgentTemplate, id: string): AgentConfig {
  return {
    id,
    ...template,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  };
}

// 智能体可用的动作类型（基于角色映射的权威来源）
export const WHITEBOARD_ACTIONS = [
  'wb_open',
  'wb_close',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_clear',
  'wb_delete',
];

export const SLIDE_ACTIONS = ['spotlight', 'laser', 'play_video'];

/**
 * 将智能体角色映射到其允许的动作集。
 * 老师获得幻灯片 + 白板控制权；其他角色仅获得白板控制权。
 */
export const ROLE_ACTIONS: Record<string, string[]> = {
  teacher: [...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS],
  assistant: [...WHITEBOARD_ACTIONS],
  student: [...WHITEBOARD_ACTIONS],
};

/**
 * 获取给定角色的默认允许动作。
 * 对于未知角色回退到仅白板动作。
 */
export function getActionsForRole(role: string): string[] {
  return ROLE_ACTIONS[role] || [...WHITEBOARD_ACTIONS];
}
