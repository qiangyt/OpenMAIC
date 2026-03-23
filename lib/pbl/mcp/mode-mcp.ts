/**
 * Mode MCP - 控制 PBL 生成过程中的当前工作流模式。
 *
 * 从 PBL-Nano 迁移而来。简化版：无 list_tools()，纯方法调用。
 */

import type { PBLMode, PBLToolResult } from '../types';

export class ModeMCP {
  private currentMode: PBLMode;
  private availableModes: PBLMode[];

  constructor(availableModes: PBLMode[], defaultMode: PBLMode) {
    this.availableModes = availableModes;
    this.currentMode = defaultMode;
  }

  setMode(mode: PBLMode): PBLToolResult {
    if (!this.availableModes.includes(mode)) {
      return {
        success: false,
        error: `Mode "${mode}" not available. Available: ${this.availableModes.join(', ')}`,
      };
    }
    if (mode === this.currentMode) {
      return { success: false, error: `Already in "${mode}" mode.` };
    }
    this.currentMode = mode;
    return { success: true, message: `Switched to "${mode}" mode.` };
  }

  getCurrentMode(): PBLMode {
    return this.currentMode;
  }

  getAvailableModes(): PBLMode[] {
    return [...this.availableModes];
  }
}
