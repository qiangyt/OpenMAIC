'use client';

import { useCallback } from 'react';
import type { PBLContent } from '@/lib/types/stage';
import type { PBLProjectConfig } from '@/lib/pbl/types';
import { useStageStore } from '@/lib/store/stage';
import { PBLRoleSelection } from './pbl/role-selection';
import { PBLWorkspace } from './pbl/workspace';
import { useI18n } from '@/lib/hooks/use-i18n';

interface PBLRendererProps {
  readonly content: PBLContent;
  readonly mode: 'autonomous' | 'playback';
  readonly sceneId: string;
}

export function PBLRenderer({ content, mode: _mode, sceneId }: PBLRendererProps) {
  const { t } = useI18n();

  const { projectConfig } = content;
  const selectedRole = projectConfig?.selectedRole ?? null;

  const updateConfig = useCallback(
    (updatedConfig: PBLProjectConfig) => {
      const scenes = useStageStore.getState().scenes;
      const updatedScenes = scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              content: { type: 'pbl' as const, projectConfig: updatedConfig },
            }
          : scene,
      );
      useStageStore.setState({ scenes: updatedScenes });
    },
    [sceneId],
  );

  const handleSelectRole = useCallback(
    (roleName: string) => {
      if (!projectConfig) return;
      const newConfig = { ...projectConfig, selectedRole: roleName };

      // 如果聊天为空且当前问题有生成的问题，添加问答智能体的欢迎消息
      const activeIssue = newConfig.issueboard.issues.find((i) => i.is_active);
      if (activeIssue?.generated_questions && newConfig.chat.messages.length === 0) {
        const welcomeMsg = t('pbl.chat.welcomeMessage')
          .replace('{title}', activeIssue.title)
          .replace('{questions}', activeIssue.generated_questions);
        newConfig.chat = {
          messages: [
            {
              id: `msg_welcome_${Date.now()}`,
              agent_name: activeIssue.question_agent_name,
              message: welcomeMsg,
              timestamp: Date.now(),
              read_by: [],
            },
          ],
        };
      }

      updateConfig(newConfig);
    },
    [projectConfig, updateConfig, t],
  );

  const handleReset = useCallback(() => {
    if (!projectConfig) return;
    // 重置所有问题并重新激活第一个
    const resetIssues = projectConfig.issueboard.issues
      .map((i) => ({ ...i, is_done: false, is_active: false }))
      .sort((a, b) => a.index - b.index);
    if (resetIssues.length > 0) {
      resetIssues[0].is_active = true;
    }

    updateConfig({
      ...projectConfig,
      selectedRole: null,
      chat: { messages: [] },
      issueboard: {
        ...projectConfig.issueboard,
        issues: resetIssues,
        current_issue_id: resetIssues.length > 0 ? resetIssues[0].id : null,
      },
    });
  }, [projectConfig, updateConfig]);

  // 检查旧版格式（带有 url/html 的旧版 PBL）
  if (!projectConfig) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>{t('pbl.legacyFormat')}</p>
      </div>
    );
  }

  // 检查项目是否已生成（是否有智能体）
  if (projectConfig.agents.length === 0 && projectConfig.projectInfo.title === '') {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>{t('pbl.emptyProject')}</p>
      </div>
    );
  }

  // 未选择角色 → 显示角色选择界面
  if (!selectedRole) {
    return (
      <PBLRoleSelection
        projectInfo={projectConfig.projectInfo}
        agents={projectConfig.agents}
        onSelectRole={handleSelectRole}
      />
    );
  }

  // 已选择角色 → 显示工作区
  return (
    <PBLWorkspace
      projectConfig={projectConfig}
      userRole={selectedRole}
      onConfigUpdate={updateConfig}
      onReset={handleReset}
    />
  );
}
