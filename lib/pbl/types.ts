/**
 * PBL（项目式学习）类型定义
 *
 * 从 PBL-Nano 迁移而来，使用 PBL 前缀以避免与 MAIC-OSS 类型冲突。
 */

export type PBLMode = 'project_info' | 'agent' | 'issueboard' | 'idle';

export interface PBLProjectInfo {
  title: string;
  description: string;
}

export type PBLRoleDivision = 'management' | 'development';

export interface PBLAgent {
  name: string;
  actor_role: string;
  role_division: PBLRoleDivision;
  system_prompt: string;
  default_mode: string;
  delay_time: number;
  env: Record<string, unknown>;
  is_user_role: boolean;
  is_active: boolean;
  is_system_agent: boolean;
}

export interface PBLIssue {
  id: string;
  title: string;
  description: string;
  person_in_charge: string;
  participants: string[];
  notes: string;
  parent_issue: string | null;
  index: number;
  is_done: boolean;
  is_active: boolean;
  generated_questions: string;
  question_agent_name: string;
  judge_agent_name: string;
}

export interface PBLIssueboard {
  agent_ids: string[];
  issues: PBLIssue[];
  current_issue_id: string | null;
}

export interface PBLChatMessage {
  id: string;
  agent_name: string;
  message: string;
  timestamp: number;
  read_by: string[];
}

export interface PBLChat {
  messages: PBLChatMessage[];
}

export interface PBLProjectConfig {
  projectInfo: PBLProjectInfo;
  agents: PBLAgent[];
  issueboard: PBLIssueboard;
  chat: PBLChat;
  selectedRole?: string | null;
}

/**
 * MCP 工具结果（所有 MCP 类共享）
 */
export interface PBLToolResult {
  success: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}
