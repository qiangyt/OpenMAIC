/**
 * 生成流水线的 Prompt 和上下文构建工具。
 */

import type { PdfImage } from '@/lib/types/generation';
import type { AgentInfo, SceneGenerationContext } from './pipeline-types';

/** 构建课程上下文字符串，用于注入到动作提示词中 */
export function buildCourseContext(ctx?: SceneGenerationContext): string {
  if (!ctx) return '';

  const lines: string[] = [];

  // 带位置标记的课程大纲
  lines.push('Course Outline:');
  ctx.allTitles.forEach((t, i) => {
    const marker = i === ctx.pageIndex - 1 ? ' ← current' : '';
    lines.push(`  ${i + 1}. ${t}${marker}`);
  });

  // 位置信息
  lines.push('');
  lines.push(
    'IMPORTANT: All pages belong to the SAME class session. Do NOT greet again after the first page. When referencing content from earlier pages, say "we just covered" or "as mentioned on page N" — NEVER say "last class" or "previous session" because there is no previous session.',
  );
  lines.push('');
  if (ctx.pageIndex === 1) {
    lines.push('Position: This is the FIRST page. Open with a greeting and course introduction.');
  } else if (ctx.pageIndex === ctx.totalPages) {
    lines.push('Position: This is the LAST page. Conclude the course with a summary and closing.');
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  } else {
    lines.push(`Position: Page ${ctx.pageIndex} of ${ctx.totalPages} (middle of the course).`);
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  }

  // 上一页语音，用于过渡参考
  if (ctx.previousSpeeches.length > 0) {
    lines.push('');
    lines.push('Previous page speech (for transition reference):');
    const lastSpeech = ctx.previousSpeeches[ctx.previousSpeeches.length - 1];
    lines.push(`  "...${lastSpeech.slice(-150)}"`);
  }

  return lines.join('\n');
}

/** 格式化智能体列表，用于注入到动作提示词中 */
export function formatAgentsForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const lines = ['Classroom Agents:'];
  for (const a of agents) {
    const personaPart = a.persona ? ` — ${a.persona}` : '';
    lines.push(`- id: "${a.id}", name: "${a.name}", role: ${a.role}${personaPart}`);
  }
  return lines.join('\n');
}

/** 提取教师智能体的个性描述，用于注入到大纲/内容提示词中 */
export function formatTeacherPersonaForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const teacher = agents.find((a) => a.role === 'teacher');
  if (!teacher?.persona) return '';

  return `Teacher Persona:\nName: ${teacher.name}\n${teacher.persona}\n\nAdapt the content style and tone to match this teacher's personality. IMPORTANT: The teacher's name and identity must NOT appear on the slides — no "Teacher ${teacher.name}'s tips", no "Teacher's message", etc. Slides should read as neutral, professional visual aids.`;
}

/**
 * 格式化单个 PdfImage 描述，用于包含在提示词中。
 * 当可用时包含尺寸/宽高比信息。
 */
export function formatImageDescription(img: PdfImage, language: string): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | 尺寸: ${img.width}×${img.height} (宽高比${ratio})`;
  }
  const desc = img.description ? ` | ${img.description}` : '';
  return language === 'zh-CN'
    ? `- **${img.id}**: 来自PDF第${img.pageNumber}页${dimInfo}${desc}`
    : `- **${img.id}**: from PDF page ${img.pageNumber}${dimInfo}${desc}`;
}

/**
 * 格式化简短的图片占位符，用于视觉模式。
 * 仅包含 ID + 页码 + 尺寸 + 宽高比（无描述），因为模型可以看到实际图片。
 */
export function formatImagePlaceholder(img: PdfImage, language: string): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | 尺寸: ${img.width}×${img.height} (宽高比${ratio})`;
  }
  return language === 'zh-CN'
    ? `- **${img.id}**: PDF第${img.pageNumber}页的图片${dimInfo} [参见附图]`
    : `- **${img.id}**: image from PDF page ${img.pageNumber}${dimInfo} [see attached]`;
}

/**
 * 构建 AI SDK 的多模态用户内容数组。
 * 将文本和图片交错排列，以便模型能将 img_id 与实际图片关联。
 * 每个图片标签包含可用时的尺寸信息，以便模型在看到图片前就知道大小（对布局决策很重要）。
 */
export function buildVisionUserContent(
  userPrompt: string,
  images: Array<{ id: string; src: string; width?: number; height?: number }>,
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
  > = [{ type: 'text', text: userPrompt }];
  if (images.length > 0) {
    parts.push({ type: 'text', text: '\n\n--- Attached Images ---' });
    for (const img of images) {
      let dimInfo = '';
      if (img.width && img.height) {
        const ratio = (img.width / img.height).toFixed(2);
        dimInfo = ` (${img.width}×${img.height}, 宽高比${ratio})`;
      }
      parts.push({ type: 'text', text: `\n**${img.id}**${dimInfo}:` });
      // 去除 data URI 前缀 — AI SDK 只接受 http(s) URL 或原始 base64
      const dataUriMatch = img.src.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        parts.push({
          type: 'image',
          image: dataUriMatch[2],
          mimeType: dataUriMatch[1],
        });
      } else {
        parts.push({ type: 'image', image: img.src });
      }
    }
  }
  return parts;
}
