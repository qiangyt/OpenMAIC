/**
 * Project MCP - 管理 PBL 生成过程中的项目信息（标题 + 描述）。
 *
 * 从 PBL-Nano 迁移而来。无 HTML 渲染，无 list_tools()。
 * 直接操作共享的 PBLProjectConfig。
 */

import type { PBLProjectConfig, PBLToolResult } from '../types';

export class ProjectMCP {
  private config: PBLProjectConfig;

  constructor(config: PBLProjectConfig) {
    this.config = config;
  }

  getProjectInfo(): PBLToolResult {
    return {
      success: true,
      title: this.config.projectInfo.title,
      description: this.config.projectInfo.description,
    };
  }

  updateTitle(title: string): PBLToolResult {
    if (!title?.trim()) {
      return { success: false, error: 'Title cannot be empty.' };
    }
    this.config.projectInfo.title = title;
    return { success: true, message: 'Title updated successfully.' };
  }

  updateDescription(description: string): PBLToolResult {
    if (description === null || description === undefined) {
      return { success: false, error: 'Description cannot be null.' };
    }
    this.config.projectInfo.description = description;
    return { success: true, message: 'Description updated successfully.' };
  }
}
