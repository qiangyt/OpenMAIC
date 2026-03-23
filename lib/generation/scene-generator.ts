/**
 * 阶段 2: 场景内容和动作生成。
 *
 * 从场景大纲生成完整场景（slide/quiz/interactive/pbl 及其动作）。
 */

import { nanoid } from 'nanoid';
import katex from 'katex';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  ScientificModel,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import type { LanguageModel } from 'ai';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { generatePBLContent } from '@/lib/pbl/generate-pbl';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { postProcessInteractiveHtml } from './interactive-post-processor';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import {
  buildCourseContext,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
} from './prompt-formatters';
import type { PPTElement, Slide, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

// ==================== 阶段 2: 完整场景（两步） ====================

/**
 * 阶段 3: 生成完整场景（并行版本）
 *
 * 两步:
 * - 步骤 3.1: 大纲 -> 页面内容（slide/quiz）
 * - 步骤 3.2: 内容 + 脚本 -> 动作列表
 *
 * 所有场景使用 Promise.all 并行生成
 */
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  const totalScenes = sceneOutlines.length;
  let completedCount = 0;

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在并行生成 ${totalScenes} 个场景...`,
    scenesGenerated: 0,
    totalScenes,
  });

  // 并行生成所有场景
  const results = await Promise.all(
    sceneOutlines.map(async (outline, index) => {
      try {
        const sceneId = await generateSingleScene(outline, api, aiCall);

        // 更新进度（非原子操作，但足以用于 UI 显示）
        completedCount++;
        callbacks?.onProgress?.({
          currentStage: 3,
          overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
          stageProgress: Math.floor((completedCount / totalScenes) * 100),
          statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
          scenesGenerated: completedCount,
          totalScenes,
        });

        return { success: true, sceneId, index };
      } catch (error) {
        completedCount++;
        callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
        return { success: false, sceneId: null, index };
      }
    }),
  );

  // 按原始顺序收集成功的 sceneId
  const sceneIds = results
    .filter(
      (r): r is { success: true; sceneId: string; index: number } =>
        r.success && r.sceneId !== null,
    )
    .sort((a, b) => a.index - b.index)
    .map((r) => r.sceneId);

  return { success: true, data: sceneIds };
}

/**
 * 生成单个场景（两步流程）
 *
 * 步骤 3.1: 生成内容
 * 步骤 3.2: 生成动作
 */
async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
): Promise<string | null> {
  // 步骤 3.1: 生成内容
  log.info(`Step 3.1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall);
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  // 步骤 3.2: 生成动作
  log.info(`Step 3.2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall);
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  // 创建完整的 Scene
  return createSceneWithActions(outline, content, actions, api);
}

/**
 * 步骤 3.1: 根据大纲生成内容
 */
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  languageModel?: LanguageModel,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  // 如果大纲是 interactive 但缺少 interactiveConfig，回退到 slide
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    const fallbackOutline = { ...outline, type: 'slide' as const };
    return generateSlideContent(
      fallbackOutline,
      aiCall,
      assignedImages,
      imageMapping,
      visionEnabled,
      generatedMediaMapping,
      agents,
    );
  }

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
      );
    case 'quiz':
      return generateQuizContent(outline, aiCall);
    case 'interactive':
      return generateInteractiveContent(outline, aiCall, outline.language);
    case 'pbl':
      return generatePBLSceneContent(outline, languageModel);
    default:
      return null;
  }
}

/**
 * 检查字符串是否看起来像图片 ID（例如 "img_1"、"img_2"）
 * 而不是 base64 data URL 或实际 URL
 *
 * 此函数区分:
 * - 图片 ID: "img_1"、"img_2" 等 → 返回 true
 * - Base64 data URL: "data:image/..." → 返回 false
 * - HTTP URL: "http://..."、"https://..." → 返回 false
 * - 相对路径: "/images/..." → 返回 false
 */
function isImageIdReference(value: string): boolean {
  if (!value) return false;
  // 排除真实 URL 和路径
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false; // 相对路径
  // 匹配图片 ID 格式: img_1, img_2 等
  return /^img_\d+$/i.test(value);
}

/**
 * 检查字符串是否看起来像生成的图片/视频 ID（例如 "gen_img_1"、"gen_img_xK8f2mQ"）
 * 这些是 AI 生成媒体的占位符，不是 PDF 提取的图片。
 */
function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

/**
 * 将 src 字段中的图片 ID 引用解析为实际的 base64 URL
 *
 * AI 生成: { type: "image", src: "img_1", ... }
 * 此函数替换为: { type: "image", src: "data:image/png;base64,...", ... }
 *
 * 设计理由（方案 B）:
 * - 更简单: AI 只需知道一个字段（src）
 * - 一致性: 生成的 JSON 结构与最终 PPTImageElement 匹配
 * - 直观: src 是图片源，先作为 ID 再作为实际 URL
 * - 减少提示词复杂度: 无需解释 imageId 与 src 的区别
 */
function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null; // 移除无效的图片元素
        }
        const src = el.src as string;

        // 如果 src 是图片 ID 引用，替换为实际 URL
        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null; // 移除无效的图片元素
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        // 生成的图片引用 — 保留占位符用于异步回填
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // 保留带占位符 ID 的元素 — 前端渲染骨架屏
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        if (!('src' in el)) {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // 保留带占位符 ID 的元素 — 前端渲染骨架屏
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * 修复缺少必需字段的元素
 * 为 AI 可能未正确生成的字段添加默认值
 */
function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    // 修复线条元素
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      // 确保 points 字段存在并有默认值
      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string]; // 默认: 两端都无标记
      }

      // 确保 start/end 存在
      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      // 确保 style 存在
      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      // 确保 color 存在
      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    // 修复文本元素
    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      return textEl as typeof el;
    }

    // 修复图片元素
    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      // 使用已知宽高比修正尺寸（此时 src 仍然是 img_id）
      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            // 保持宽度，修正高度
            const newH = Math.round(curW / knownRatio);
            if (newH > 462) {
              // 画布 562.5 - 边距 50×2
              const newW = Math.round(462 * knownRatio);
              imageEl.width = newW;
              imageEl.height = 462;
            } else {
              imageEl.height = newH;
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    // 修复形状元素
    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        // 默认为矩形
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

/**
 * 处理 LaTeX 元素: 使用 KaTeX 将 latex 字符串渲染为 HTML。
 * 填充 html 和 fixedRatio 字段。
 * 转换失败的元素会被移除。
 */
function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const html = katex.renderToString(latexStr, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        });

        return {
          ...el,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * 生成幻灯片内容
 */
async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
): Promise<GeneratedSlideContent | null> {
  const lang = outline.language || 'zh-CN';

  // 为提示词构建已分配图片的描述
  let assignedImagesText = '无可用图片，禁止插入任何 image 元素';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      // 视觉模式: 分为视觉图片和仅文本
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img, lang));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, lang),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages
        .map((img) => formatImageDescription(img, lang))
        .join('\n');
    }
  }

  // 添加生成媒体占位符信息（图片 + 视频）
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'image')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'video')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(`AI-Generated Videos (use these IDs as video element src):\n${genVidDescs}`);
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  // 画布尺寸（匹配 viewportSize 和 viewportRatio）
  const canvasWidth = 1000;
  const canvasHeight = 562.5;

  const teacherContext = formatTeacherPersonaForPrompt(agents);

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    elements: '（根据要点自动生成）',
    assignedImages: assignedImagesText,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    teacherContext,
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);
  if (assignedImages && assignedImages.length > 0) {
    log.debug(`Assigned images: ${assignedImages.map((img) => img.id).join(', ')}`);
  }
  if (visionImages && visionImages.length > 0) {
    log.debug(`Vision images: ${visionImages.map((img) => img.id).join(', ')}`);
  }

  const response = await aiCall(prompts.system, prompts.user, visionImages);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  // 调试: 在解析前记录图片元素
  const imageElements = generatedData.elements.filter((el) => el.type === 'image');
  if (imageElements.length > 0) {
    log.debug(
      `Image elements before resolution:`,
      imageElements.map((el) => ({
        type: el.type,
        src:
          (el as Record<string, unknown>).src &&
          String((el as Record<string, unknown>).src).substring(0, 50),
      })),
    );
    log.debug(`imageMapping keys:`, imageMapping ? Object.keys(imageMapping).length : '0 keys');
  }

  // 修复缺少必需字段的元素 + 宽高比修正（此时 src 仍然是 img_id）
  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  log.debug(`After element fixing: ${fixedElements.length} elements`);

  // 处理 LaTeX 元素: 将 latex 字符串渲染为 HTML（通过 KaTeX）
  const latexProcessedElements = processLatexElements(fixedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);

  // 将 image_id 引用解析为实际 URL
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  log.debug(`After image resolution: ${resolvedElements.length} elements`);

  // 处理元素，分配唯一 ID
  const processedElements: PPTElement[] = resolvedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];

  // 处理背景
  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  return {
    elements: processedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}

/**
 * 生成测验内容
 */
async function generateQuizContent(
  outline: SceneOutline,
  aiCall: AICallFn,
): Promise<GeneratedQuizContent | null> {
  const quizConfig = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'],
  };

  const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    questionCount: quizConfig.questionCount,
    difficulty: quizConfig.difficulty,
    questionTypes: quizConfig.questionTypes.join(', '),
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating quiz content for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

  if (!generatedQuestions || !Array.isArray(generatedQuestions)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

  // 确保每个问题都有 ID 并规范化选项格式
  const questions: QuizQuestion[] = generatedQuestions.map((q) => {
    const isText = q.type === 'short_answer';
    return {
      ...q,
      id: q.id || `q_${nanoid(8)}`,
      options: isText ? undefined : normalizeQuizOptions(q.options),
      answer: isText ? undefined : normalizeQuizAnswer(q as unknown as Record<string, unknown>),
      hasAnswer: isText ? false : true,
    };
  });

  return { questions };
}

/**
 * 规范化 AI 响应中的测验选项。
 * AI 可能生成纯字符串 ["选项A", "选项B"] 或 QuizOption 对象。
 * 此函数将其规范化为 QuizOption[] 格式: { value: "A", label: "选项A" }
 */
function normalizeQuizOptions(
  options: unknown[] | undefined,
): { value: string; label: string }[] | undefined {
  if (!options || !Array.isArray(options)) return undefined;

  return options.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D...

    if (typeof opt === 'string') {
      return { value: letter, label: opt };
    }

    if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      return {
        value: typeof obj.value === 'string' ? obj.value : letter,
        label: typeof obj.label === 'string' ? obj.label : String(obj.value || obj.text || letter),
      };
    }

    return { value: letter, label: String(opt) };
  });
}

/**
 * 规范化 AI 响应中的测验答案。
 * AI 可能将正确答案生成为字符串或字符串数组，使用各种字段名。
 * 此函数将其规范化为匹配选项值的 string[] 格式。
 */
function normalizeQuizAnswer(question: Record<string, unknown>): string[] | undefined {
  // AI 可能使用 "correctAnswer"、"answer" 或 "correct_answer"
  const raw =
    question.answer ??
    question.correctAnswer ??
    (question as Record<string, unknown>).correct_answer;
  if (!raw) return undefined;

  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [String(raw)];
}

/**
 * 生成交互页面内容
 * 两次 AI 调用 + 后处理:
 * 1. 科学建模 -> ScientificModel（失败时有回退）
 * 2. 带约束的 HTML 生成 -> 后处理的 HTML
 */
async function generateInteractiveContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): Promise<GeneratedInteractiveContent | null> {
  const config = outline.interactiveConfig!;

  // 步骤 1: 科学建模（失败时回退）
  let scientificModel: ScientificModel | undefined;
  try {
    const modelPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_SCIENTIFIC_MODEL, {
      subject: config.subject || '',
      conceptName: config.conceptName,
      conceptOverview: config.conceptOverview,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      designIdea: config.designIdea,
    });

    if (modelPrompts) {
      log.info(`Step 1: Scientific modeling for: ${outline.title}`);
      const modelResponse = await aiCall(modelPrompts.system, modelPrompts.user);
      const parsed = parseJsonResponse<ScientificModel>(modelResponse);
      if (parsed && parsed.core_formulas) {
        scientificModel = parsed;
        log.info(
          `Scientific model: ${parsed.core_formulas.length} formulas, ${parsed.constraints?.length || 0} constraints`,
        );
      }
    }
  } catch (error) {
    log.warn(`Scientific modeling failed, continuing without: ${error}`);
  }

  // 为 HTML 生成提示词格式化科学约束
  let scientificConstraints = 'No specific scientific constraints available.';
  if (scientificModel) {
    const lines: string[] = [];
    if (scientificModel.core_formulas?.length) {
      lines.push(`Core Formulas: ${scientificModel.core_formulas.join('; ')}`);
    }
    if (scientificModel.mechanism?.length) {
      lines.push(`Mechanisms: ${scientificModel.mechanism.join('; ')}`);
    }
    if (scientificModel.constraints?.length) {
      lines.push(`Must Obey: ${scientificModel.constraints.join('; ')}`);
    }
    if (scientificModel.forbidden_errors?.length) {
      lines.push(`Forbidden Errors: ${scientificModel.forbidden_errors.join('; ')}`);
    }
    scientificConstraints = lines.join('\n');
  }

  // 步骤 2: HTML 生成
  const htmlPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_HTML, {
    conceptName: config.conceptName,
    subject: config.subject || '',
    conceptOverview: config.conceptOverview,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    scientificConstraints,
    designIdea: config.designIdea,
    language,
  });

  if (!htmlPrompts) {
    log.error(`Failed to build HTML prompt for: ${outline.title}`);
    return null;
  }

  log.info(`Step 2: Generating HTML for: ${outline.title}`);
  const htmlResponse = await aiCall(htmlPrompts.system, htmlPrompts.user);
  // Extract HTML from response
  const rawHtml = extractHtml(htmlResponse);
  if (!rawHtml) {
    log.error(`Failed to extract HTML from response for: ${outline.title}`);
    return null;
  }

  // Step 3: Post-process HTML (LaTeX delimiter conversion + KaTeX injection)
  const processedHtml = postProcessInteractiveHtml(rawHtml);
  log.info(`Post-processed HTML (${processedHtml.length} chars) for: ${outline.title}`);

  return {
    html: processedHtml,
    scientificModel,
  };
}

/**
 * 生成 PBL 项目内容
 * 使用 lib/pbl/generate-pbl.ts 中的智能体循环
 */
async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  log.info(`Generating PBL content for: ${outline.title}`);

  try {
    const projectConfig = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTopic,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        language: pblConfig.language,
      },
      languageModel,
      {
        onProgress: (msg) => log.info(`${msg}`),
      },
    );
    log.info(
      `PBL generated: ${projectConfig.agents.length} agents, ${projectConfig.issueboard.issues.length} issues`,
    );

    return { projectConfig };
  } catch (error) {
    log.error(`Failed:`, error);
    return null;
  }
}

/**
 * 从 AI 响应中提取 HTML 文档。
 * 首先尝试查找 <!DOCTYPE html>...</html>，然后回退到代码块提取。
 */
function extractHtml(response: string): string | null {
  // Strategy 1: Find complete HTML document
  const doctypeStart = response.indexOf('<!DOCTYPE html>');
  const htmlTagStart = response.indexOf('<html');
  const start = doctypeStart !== -1 ? doctypeStart : htmlTagStart;

  if (start !== -1) {
    const htmlEnd = response.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return response.substring(start, htmlEnd + 7);
    }
  }

  // Strategy 2: Extract from code block
  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  // Strategy 3: If response itself looks like HTML
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  log.error('Response preview:', response.substring(0, 200));
  return null;
}

/**
 * 步骤 3.2: 根据内容和脚本生成动作
 */
export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  aiCall: AICallFn,
  ctx?: SceneGenerationContext,
  agents?: AgentInfo[],
  userProfile?: string,
): Promise<Action[]> {
  const agentsText = formatAgentsForPrompt(agents);

  if (outline.type === 'slide' && 'elements' in content) {
    // Format element list for AI to select from
    const elementsText = formatElementsForPrompt(content.elements);

    const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      elements: elementsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      userProfile: userProfile || '',
    });

    if (!prompts) {
      return generateDefaultSlideActions(outline, content.elements);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      // Validate and fill in Action IDs
      return processActions(actions, content.elements, agents);
    }

    return generateDefaultSlideActions(outline, content.elements);
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    // Format question list for AI reference
    const questionsText = formatQuestionsForPrompt(content.questions);

    const prompts = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      questions: questionsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
    });

    if (!prompts) {
      return generateDefaultQuizActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultQuizActions(outline);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const config = outline.interactiveConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.INTERACTIVE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      conceptName: config?.conceptName || outline.title,
      designIdea: config?.designIdea || '',
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
    });

    if (!prompts) {
      return generateDefaultInteractiveActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultInteractiveActions(outline);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const pblConfig = outline.pblConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      projectTopic: pblConfig?.projectTopic || outline.title,
      projectDescription: pblConfig?.projectDescription || outline.description,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
    });

    if (!prompts) {
      return generateDefaultPBLActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultPBLActions(outline);
  }

  return [];
}

/**
 * 生成默认 PBL 动作（回退方案）
 */
function generateDefaultPBLActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: 'PBL 项目介绍',
      text: '现在让我们开始一个项目式学习活动。请选择你的角色，查看任务看板，开始协作完成项目。',
    },
  ];
}

/**
 * 为 AI 格式化元素列表，以便选择 elementId
 */
function formatElementsForPrompt(elements: PPTElement[]): string {
  return elements
    .map((el) => {
      let summary = '';
      if (el.type === 'text' && 'content' in el) {
        // Extract text content summary (strip HTML tags)
        const textContent = ((el.content as string) || '').replace(/<[^>]*>/g, '').substring(0, 50);
        summary = `Content summary: "${textContent}${textContent.length >= 50 ? '...' : ''}"`;
      } else if (el.type === 'chart' && 'chartType' in el) {
        summary = `Chart type: ${el.chartType}`;
      } else if (el.type === 'image') {
        summary = 'Image element';
      } else if (el.type === 'shape' && 'shapeName' in el) {
        summary = `Shape: ${el.shapeName || 'unknown'}`;
      } else if (el.type === 'latex' && 'latex' in el) {
        summary = `Formula: ${((el.latex as string) || '').substring(0, 30)}`;
      } else {
        summary = `${el.type} element`;
      }
      return `- id: "${el.id}", type: "${el.type}", ${summary}`;
    })
    .join('\n');
}

/**
 * 为 AI 参考格式化问题列表
 */
function formatQuestionsForPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const optionsText = q.options ? `Options: ${q.options.join(', ')}` : '';
      return `Q${i + 1} (${q.type}): ${q.question}\n${optionsText}`;
    })
    .join('\n\n');
}

/**
 * 处理并验证动作
 */
function processActions(actions: Action[], elements: PPTElement[], agents?: AgentInfo[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];
  const nonTeacherAgents = agents?.filter((a) => a.role !== 'teacher') || [];

  return actions.map((action) => {
    // Ensure each action has an ID
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    // Validate spotlight elementId
    if (processedAction.type === 'spotlight') {
      const spotlightAction = processedAction;
      if (!spotlightAction.elementId || !elementIds.has(spotlightAction.elementId)) {
        // If elementId is invalid, try selecting the first element
        if (elements.length > 0) {
          spotlightAction.elementId = elements[0].id;
          log.warn(
            `Invalid elementId, falling back to first element: ${spotlightAction.elementId}`,
          );
        }
      }
    }

    // Validate/fill discussion agentId
    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (processedAction.agentId && agentIds.has(processedAction.agentId)) {
        // agentId valid — keep it
      } else {
        // agentId missing or invalid — pick a random student, or non-teacher, or skip
        const pool = studentAgents.length > 0 ? studentAgents : nonTeacherAgents;
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          log.warn(
            `Discussion agentId "${processedAction.agentId || '(none)'}" invalid, assigned: ${picked.id} (${picked.name})`,
          );
          processedAction.agentId = picked.id;
        }
      }
    }

    return processedAction;
  });
}

/**
 * 生成默认幻灯片动作（回退方案）
 */
function generateDefaultSlideActions(outline: SceneOutline, elements: PPTElement[]): Action[] {
  const actions: Action[] = [];

  // Add spotlight for text elements
  const textElements = elements.filter((el) => el.type === 'text');
  if (textElements.length > 0) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: '聚焦重点',
      elementId: textElements[0].id,
    });
  }

  // Add opening speech based on key points
  const speechText = outline.keyPoints?.length
    ? outline.keyPoints.join('。') + '。'
    : outline.description || outline.title;
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: '场景讲解',
    text: speechText,
  });

  return actions;
}

/**
 * 生成默认测验动作（回退方案）
 */
function generateDefaultQuizActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '测验引导',
      text: '现在让我们来做一个小测验，检验一下学习成果。',
    },
  ];
}

/**
 * 生成默认互动动作（回退方案）
 */
function generateDefaultInteractiveActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '交互引导',
      text: '现在让我们通过交互式可视化来探索这个概念。请尝试操作页面中的元素，观察变化。',
    },
  ];
}

/**
 * 创建带有动作的完整场景
 */
export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    // Build complete Slide object
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: defaultTheme,
      elements: content.elements,
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: slide,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
