'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  loadImageMapping,
  loadPdfBlob,
  cleanupOldImages,
  storeImages,
} from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { db } from '@/lib/utils/database';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type { Stage } from '@/lib/types/stage';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { AgentRevealModal } from '@/components/agent/agent-reveal-modal';
import { createLogger } from '@/lib/logger';
import { type GenerationSessionState, ALL_STEPS, getActiveSteps } from './types';
import { StepVisualizer } from './components/visualizers';

const log = createLogger('GenerationPreview');

function GenerationPreviewContent() {
  const router = useRouter();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string }>>(
    [],
  );
  const [showAgentReveal, setShowAgentReveal] = useState(false);
  const [generatedAgents, setGeneratedAgents] = useState<
    Array<{
      id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      priority: number;
    }>
  >([]);
  const agentRevealResolveRef = useRef<(() => void) | null>(null);

  // 根据会话状态计算活动步骤
  const activeSteps = getActiveSteps(session);

  // 从 sessionStorage 加载会话
  useEffect(() => {
    cleanupOldImages(24).catch((e) => log.error(e));

    const saved = sessionStorage.getItem('generationSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GenerationSessionState;
        setSession(parsed);
      } catch (e) {
        log.error('解析生成会话失败：', e);
      }
    }
    setSessionLoaded(true);
  }, []);

  // 组件卸载时中止所有进行中的请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 从 localStorage 获取 API 凭据
  const getApiHeaders = () => {
    const modelConfig = getCurrentModelConfig();
    const settings = useSettingsStore.getState();
    const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
    const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
    return {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
      'x-base-url': modelConfig.baseUrl,
      'x-provider-type': modelConfig.providerType || '',
      'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
      // 图像生成提供者
      'x-image-provider': settings.imageProviderId || '',
      'x-image-model': settings.imageModelId || '',
      'x-image-api-key': imageProviderConfig?.apiKey || '',
      'x-image-base-url': imageProviderConfig?.baseUrl || '',
      // 视频生成提供者
      'x-video-provider': settings.videoProviderId || '',
      'x-video-model': settings.videoModelId || '',
      'x-video-api-key': videoProviderConfig?.apiKey || '',
      'x-video-base-url': videoProviderConfig?.baseUrl || '',
      // 媒体生成开关
      'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
      'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
    };
  };

  // 会话加载后自动开始生成
  useEffect(() => {
    if (session && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // 主生成流程
  const startGeneration = async () => {
    if (!session) return;

    // 为此次生成创建 AbortController
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // 使用本地可变副本，以便在 PDF 解析后更新
    let currentSession = session;

    setError(null);
    setCurrentStepIndex(0);

    try {
      // 计算此会话的活动步骤（会话变更后重新计算）
      let activeSteps = getActiveSteps(currentSession);

      // 确定是否需要 PDF 解析步骤
      const hasPdfToAnalyze = !!currentSession.pdfStorageKey && !currentSession.pdfText;
      // 如果没有需要解析的 PDF，跳到下一个可用步骤
      if (!hasPdfToAnalyze) {
        const firstNonPdfIdx = activeSteps.findIndex((s) => s.id !== 'pdf-analysis');
        setCurrentStepIndex(Math.max(0, firstNonPdfIdx));
      }

      // 步骤 0：如需要则解析 PDF
      if (hasPdfToAnalyze) {
        log.debug('=== 生成预览：正在解析 PDF ===');
        const pdfBlob = await loadPdfBlob(currentSession.pdfStorageKey!);
        if (!pdfBlob) {
          throw new Error(t('generation.pdfLoadFailed'));
        }

        // 确保 pdfBlob 是有效的 Blob 且有内容
        if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
          log.error('无效的 PDF blob：', {
            type: typeof pdfBlob,
            size: pdfBlob instanceof Blob ? pdfBlob.size : 'N/A',
          });
          throw new Error(t('generation.pdfLoadFailed'));
        }

        // 包装为 File 以确保 multipart/form-data 具有正确的 content-type
        const pdfFile = new File([pdfBlob], currentSession.pdfFileName || 'document.pdf', {
          type: 'application/pdf',
        });

        const parseFormData = new FormData();
        parseFormData.append('pdf', pdfFile);

        if (currentSession.pdfProviderId) {
          parseFormData.append('providerId', currentSession.pdfProviderId);
        }
        if (currentSession.pdfProviderConfig?.apiKey?.trim()) {
          parseFormData.append('apiKey', currentSession.pdfProviderConfig.apiKey);
        }
        if (currentSession.pdfProviderConfig?.baseUrl?.trim()) {
          parseFormData.append('baseUrl', currentSession.pdfProviderConfig.baseUrl);
        }

        const parseResponse = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: parseFormData,
          signal,
        });

        if (!parseResponse.ok) {
          const errorData = await parseResponse.json();
          throw new Error(errorData.error || t('generation.pdfParseFailed'));
        }

        const parseResult = await parseResponse.json();
        if (!parseResult.success || !parseResult.data) {
          throw new Error(t('generation.pdfParseFailed'));
        }

        let pdfText = parseResult.data.text as string;

        // 如需要则截断
        if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
          pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
        }

        // 创建图像元数据并存储图像
        // 优先使用 metadata.pdfImages（两个解析器现在都返回此字段）
        const rawPdfImages = parseResult.data.metadata?.pdfImages;
        const images = rawPdfImages
          ? rawPdfImages.map(
              (img: {
                id: string;
                src?: string;
                pageNumber?: number;
                description?: string;
                width?: number;
                height?: number;
              }) => ({
                id: img.id,
                src: img.src || '',
                pageNumber: img.pageNumber || 1,
                description: img.description,
                width: img.width,
                height: img.height,
              }),
            )
          : (parseResult.data.images as string[]).map((src: string, i: number) => ({
              id: `img_${i + 1}`,
              src,
              pageNumber: 1,
            }));

        const imageStorageIds = await storeImages(images);

        const pdfImages: PdfImage[] = images.map(
          (
            img: {
              id: string;
              src: string;
              pageNumber: number;
              description?: string;
              width?: number;
              height?: number;
            },
            i: number,
          ) => ({
            id: img.id,
            src: '',
            pageNumber: img.pageNumber,
            description: img.description,
            width: img.width,
            height: img.height,
            storageId: imageStorageIds[i],
          }),
        );

        // 用解析后的 PDF 数据更新会话
        const updatedSession = {
          ...currentSession,
          pdfText,
          pdfImages,
          imageStorageIds,
          pdfStorageKey: undefined, // 清除以避免重复解析
        };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // 截断警告
        const warnings: string[] = [];
        if ((parseResult.data.text as string).length > MAX_PDF_CONTENT_CHARS) {
          warnings.push(
            t('generation.textTruncated').replace('{n}', String(MAX_PDF_CONTENT_CHARS)),
          );
        }
        if (images.length > MAX_VISION_IMAGES) {
          warnings.push(
            t('generation.imageTruncated')
              .replace('{total}', String(images.length))
              .replace('{max}', String(MAX_VISION_IMAGES)),
          );
        }
        if (warnings.length > 0) {
          setTruncationWarnings(warnings);
        }

        // 为后续步骤重新赋值本地引用
        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);
      }

      // 步骤：网络搜索（如已启用）
      const webSearchStepIdx = activeSteps.findIndex((s) => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const wsSettings = useSettingsStore.getState();
        const wsApiKey =
          wsSettings.webSearchProvidersConfig?.[wsSettings.webSearchProviderId]?.apiKey;
        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: currentSession.requirements.requirement,
            apiKey: wsApiKey || undefined,
          }),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Web search failed' }));
          throw new Error(data.error || t('generation.webSearchFailed'));
        }

        const searchData = await res.json();
        const sources = (searchData.sources || []).map((s: { title: string; url: string }) => ({
          title: s.title,
          url: s.url,
        }));
        setWebSearchSources(sources);

        const updatedSessionWithSearch = {
          ...currentSession,
          researchContext: searchData.context || '',
          researchSources: sources,
        };
        setSession(updatedSessionWithSearch);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionWithSearch));
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // 尽早加载 imageMapping（大纲和场景生成都需要）
      let imageMapping: ImageMapping = {};
      if (currentSession.imageStorageIds && currentSession.imageStorageIds.length > 0) {
        log.debug('正在从 IndexedDB 加载图像');
        imageMapping = await loadImageMapping(currentSession.imageStorageIds);
      } else if (
        currentSession.imageMapping &&
        Object.keys(currentSession.imageMapping).length > 0
      ) {
        log.debug('使用会话中的 imageMapping（旧格式）');
        imageMapping = currentSession.imageMapping;
      }

      // ── 智能体生成（在大纲之前，以便角色特征能影响结构） ──
      const settings = useSettingsStore.getState();
      let agents: Array<{
        id: string;
        name: string;
        role: string;
        persona?: string;
      }> = [];

      // 在客户端创建舞台（智能体生成需要 stageId）
      const stageId = nanoid(10);
      const stage: Stage = {
        id: stageId,
        name: extractTopicFromRequirement(currentSession.requirements.requirement),
        description: '',
        language: currentSession.requirements.language || 'zh-CN',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (settings.agentMode === 'auto') {
        const agentStepIdx = activeSteps.findIndex((s) => s.id === 'agent-generation');
        if (agentStepIdx >= 0) setCurrentStepIndex(agentStepIdx);

        try {
          const allAvatars = [
            '/avatars/assist.png',
            '/avatars/assist-2.png',
            '/avatars/clown.png',
            '/avatars/clown-2.png',
            '/avatars/curious.png',
            '/avatars/curious-2.png',
            '/avatars/note-taker.png',
            '/avatars/note-taker-2.png',
            '/avatars/teacher.png',
            '/avatars/teacher-2.png',
            '/avatars/thinker.png',
            '/avatars/thinker-2.png',
          ];

          // 尚无大纲 — 智能体生成仅使用舞台名称 + 描述
          const agentResp = await fetch('/api/generate/agent-profiles', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              stageInfo: { name: stage.name, description: stage.description },
              language: currentSession.requirements.language || 'zh-CN',
              availableAvatars: allAvatars,
            }),
            signal,
          });

          if (!agentResp.ok) throw new Error('Agent generation failed');
          const agentData = await agentResp.json();
          if (!agentData.success) throw new Error(agentData.error || 'Agent generation failed');

          // 保存到 IndexedDB 和注册表
          const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
          const savedIds = await saveGeneratedAgents(stage.id, agentData.agents);
          settings.setSelectedAgentIds(savedIds);

          // 显示卡片揭示模态框，所有卡片揭示后继续生成
          setGeneratedAgents(agentData.agents);
          setShowAgentReveal(true);
          await new Promise<void>((resolve) => {
            agentRevealResolveRef.current = resolve;
          });

          agents = savedIds
            .map((id) => useAgentRegistry.getState().getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
        } catch (err: unknown) {
          log.warn('[Generation] 智能体生成失败，回退到预设：', err);
          const registry = useAgentRegistry.getState();
          agents = settings.selectedAgentIds
            .map((id) => registry.getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
        }
      } else {
        // 预设模式 — 使用选中的智能体（包含角色特征）
        const registry = useAgentRegistry.getState();
        agents = settings.selectedAgentIds
          .map((id) => registry.getAgent(id))
          .filter(Boolean)
          .map((a) => ({
            id: a!.id,
            name: a!.name,
            role: a!.role,
            persona: a!.persona,
          }));
      }

      // ── 生成大纲（包含智能体角色特征作为教师上下文） ──
      let outlines = currentSession.sceneOutlines;

      const outlineStepIdx = activeSteps.findIndex((s) => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (!outlines || outlines.length === 0) {
        log.debug('=== 正在生成大纲 (SSE) ===');
        setStreamingOutlines([]);

        outlines = await new Promise<SceneOutline[]>((resolve, reject) => {
          const collected: SceneOutline[] = [];

          fetch('/api/generate/scene-outlines-stream', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              requirements: currentSession.requirements,
              pdfText: currentSession.pdfText,
              pdfImages: currentSession.pdfImages,
              imageMapping,
              researchContext: currentSession.researchContext,
              agents,
            }),
            signal,
          })
            .then((res) => {
              if (!res.ok) {
                return res.json().then((d) => {
                  reject(new Error(d.error || t('generation.outlineGenerateFailed')));
                });
              }

              const reader = res.body?.getReader();
              if (!reader) {
                reject(new Error(t('generation.streamNotReadable')));
                return;
              }

              const decoder = new TextDecoder();
              let sseBuffer = '';

              const pump = (): Promise<void> =>
                reader.read().then(({ done, value }) => {
                  if (value) {
                    sseBuffer += decoder.decode(value, { stream: !done });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop() || '';

                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue;
                      try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'outline') {
                          collected.push(evt.data);
                          setStreamingOutlines([...collected]);
                        } else if (evt.type === 'retry') {
                          collected.length = 0;
                          setStreamingOutlines([]);
                          setStatusMessage(t('generation.outlineRetrying'));
                        } else if (evt.type === 'done') {
                          resolve(evt.outlines || collected);
                          return;
                        } else if (evt.type === 'error') {
                          reject(new Error(evt.error));
                          return;
                        }
                      } catch (e) {
                        log.error('解析大纲 SSE 失败：', line, e);
                      }
                    }
                  }
                  if (done) {
                    if (collected.length > 0) {
                      resolve(collected);
                    } else {
                      reject(new Error(t('generation.outlineEmptyResponse')));
                    }
                    return;
                  }
                  return pump();
                });

              pump().catch(reject);
            })
            .catch(reject);
        });

        const updatedSession = { ...currentSession, sceneOutlines: outlines };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // 大纲生成成功 — 清除首页草稿缓存
        try {
          localStorage.removeItem('requirementDraft');
        } catch {
          /* 忽略 */
        }

        // 短暂停顿让用户看到最终大纲状态
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      // 进入场景生成步骤
      setStatusMessage('');
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      // 存储舞台和大纲
      const store = useStageStore.getState();
      store.setStage(stage);
      store.setOutlines(outlines);

      // 前进到幻灯片内容步骤
      const contentStepIdx = activeSteps.findIndex((s) => s.id === 'slide-content');
      if (contentStepIdx >= 0) setCurrentStepIndex(contentStepIdx);

      // 为 API 调用构建 stageInfo 和 userProfile
      const stageInfo = {
        name: stage.name,
        description: stage.description,
        language: stage.language,
        style: stage.style,
      };

      const userProfile =
        currentSession.requirements.userNickname || currentSession.requirements.userBio
          ? `Student: ${currentSession.requirements.userNickname || 'Unknown'}${currentSession.requirements.userBio ? ` — ${currentSession.requirements.userBio}` : ''}`
          : undefined;

      // 仅生成第一个场景
      store.setGeneratingOutlines(outlines);

      const firstOutline = outlines[0];

      // 步骤 2：生成内容（currentStepIndex 已经是 2）
      const contentResp = await fetch('/api/generate/scene-content', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: firstOutline,
          allOutlines: outlines,
          pdfImages: currentSession.pdfImages,
          imageMapping,
          stageInfo,
          stageId: stage.id,
          agents,
        }),
        signal,
      });

      if (!contentResp.ok) {
        const errorData = await contentResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const contentData = await contentResp.json();
      if (!contentData.success || !contentData.content) {
        throw new Error(contentData.error || t('generation.sceneGenerateFailed'));
      }

      // 生成动作（激活动作步骤指示器）
      const actionsStepIdx = activeSteps.findIndex((s) => s.id === 'actions');
      setCurrentStepIndex(actionsStepIdx >= 0 ? actionsStepIdx : currentStepIndex + 1);

      const actionsResp = await fetch('/api/generate/scene-actions', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: contentData.effectiveOutline || firstOutline,
          allOutlines: outlines,
          content: contentData.content,
          stageId: stage.id,
          agents,
          previousSpeeches: [],
          userProfile,
        }),
        signal,
      });

      if (!actionsResp.ok) {
        const errorData = await actionsResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const data = await actionsResp.json();
      if (!data.success || !data.scene) {
        throw new Error(data.error || t('generation.sceneGenerateFailed'));
      }

      // 为第一个场景生成 TTS（动作步骤的一部分 — 阻塞式）
      if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
        const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
        const speechActions = (data.scene.actions || []).filter(
          (a: { type: string; text?: string }) => a.type === 'speech' && a.text,
        );

        let ttsFailCount = 0;
        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          action.audioId = audioId;
          try {
            const resp = await fetch('/api/generate/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: action.text,
                audioId,
                ttsProviderId: settings.ttsProviderId,
                ttsVoice: settings.ttsVoice,
                ttsSpeed: settings.ttsSpeed,
                ttsApiKey: ttsProviderConfig?.apiKey || undefined,
                ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
              }),
              signal,
            });
            if (!resp.ok) {
              ttsFailCount++;
              continue;
            }
            const ttsData = await resp.json();
            if (!ttsData.success) {
              ttsFailCount++;
              continue;
            }
            const binary = atob(ttsData.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: `audio/${ttsData.format}` });
            await db.audioFiles.put({
              id: audioId,
              blob,
              format: ttsData.format,
              createdAt: Date.now(),
            });
          } catch (err) {
            log.warn(`[TTS] ${audioId} 生成失败：`, err);
            ttsFailCount++;
          }
        }

        if (ttsFailCount > 0 && speechActions.length > 0) {
          throw new Error(t('generation.speechFailed'));
        }
      }

      // 将场景添加到存储并导航
      store.addScene(data.scene);
      store.setCurrentSceneId(data.scene.id);

      // 将剩余大纲设置为骨架占位符
      const remaining = outlines.filter((o) => o.order !== data.scene.order);
      store.setGeneratingOutlines(remaining);

      // 存储生成参数供课堂页面继续生成
      sessionStorage.setItem(
        'generationParams',
        JSON.stringify({
          pdfImages: currentSession.pdfImages,
          agents,
          userProfile,
        }),
      );

      sessionStorage.removeItem('generationSession');
      await store.saveToStorage();
      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      // 导航离开时预期的 AbortError — 不显示为错误
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] 生成已中止');
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const extractTopicFromRequirement = (requirement: string): string => {
    const trimmed = requirement.trim();
    if (trimmed.length <= 500) {
      return trimmed;
    }
    return trimmed.substring(0, 500).trim() + '...';
  };

  const goBackToHome = () => {
    abortControllerRef.current?.abort();
    sessionStorage.removeItem('generationSession');
    router.push('/');
  };

  // 正在从 sessionStorage 加载会话
  if (!sessionLoaded) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // 未找到会话
  if (!session) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="size-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">{t('generation.sessionNotFound')}</h2>
            <p className="text-sm text-muted-foreground">{t('generation.sessionNotFoundDesc')}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="size-4 mr-2" />
              {t('generation.backToHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : ALL_STEPS[0];

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* 返回按钮 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t('generation.backToHome')}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            {/* 进度点 */}
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < currentStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === currentStepIndex
                        ? 'w-8 bg-blue-500'
                        : 'w-1.5 bg-muted/50',
                  )}
                />
              ))}
            </div>

            {/* 中心内容 */}
            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              {/* 图标 / 可视化容器 */}
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : isComplete ? (
                    <motion.div
                      key="complete"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
                    >
                      <CheckCircle2 className="size-16 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={activeStep.id}
                        outlines={streamingOutlines}
                        webSearchSources={webSearchSources}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 文本内容 */}
              <div className="space-y-3 max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={error ? 'error' : isComplete ? 'done' : activeStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {error
                        ? t('generation.generationFailed')
                        : isComplete
                          ? t('generation.generationComplete')
                          : t(activeStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {error
                        ? error
                        : isComplete
                          ? t('generation.classroomReady')
                          : statusMessage || t(activeStep.description)}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* 截断警告指示器 */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 && !error && !isComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                      className="flex justify-center"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                                '0 0 16px 4px rgba(251, 191, 36, 0.12), 0 0 4px 1px rgba(251, 191, 36, 0.08)',
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                              ],
                            }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="relative size-7 rounded-full flex items-center justify-center cursor-default
                                       bg-gradient-to-br from-amber-400/15 to-orange-400/10
                                       border border-amber-400/25 hover:border-amber-400/40
                                       hover:from-amber-400/20 hover:to-orange-400/15
                                       transition-colors duration-300
                                       focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                          >
                            <AlertTriangle
                              className="size-3.5 text-amber-500 dark:text-amber-400"
                              strokeWidth={2.5}
                            />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <div className="space-y-1 py-0.5">
                            {truncationWarnings.map((w, i) => (
                              <p key={i} className="text-xs leading-relaxed">
                                {w}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 底部操作 */}
        <div className="h-16 flex items-center justify-center w-full">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button size="lg" variant="outline" className="w-full h-12" onClick={goBackToHome}>
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : !isComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
                {generatedAgents.length > 0 && !showAgentReveal && (
                  <button
                    onClick={() => setShowAgentReveal(true)}
                    className="ml-2 flex items-center gap-1.5 rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs font-medium normal-case tracking-normal text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
                  >
                    <Bot className="size-3" />
                    {t('generation.viewAgents')}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* 智能体揭示模态框 */}
      <AgentRevealModal
        agents={generatedAgents}
        open={showAgentReveal}
        onClose={() => setShowAgentReveal(false)}
        onAllRevealed={() => {
          agentRevealResolveRef.current?.();
          agentRevealResolveRef.current = null;
        }}
      />
    </div>
  );
}

export default function GenerationPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
          <div className="animate-pulse space-y-4 text-center">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-64 bg-muted rounded mx-auto" />
          </div>
        </div>
      }
    >
      <GenerationPreviewContent />
    </Suspense>
  );
}
