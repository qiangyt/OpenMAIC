import temml from 'temml';
import { mml2omml } from 'mathml2omml';
import { createLogger } from '@/lib/logger';

const log = createLogger('LatexToOmml');

/**
 * 移除 mathml2omml 不支持的 MathML 元素（如 `<mpadded>`），
 * 替换为其内部内容。
 */
function stripUnsupportedMathML(mathml: string): string {
  const unsupported = ['mpadded'];
  let result = mathml;
  for (const tag of unsupported) {
    result = result.replace(new RegExp(`<${tag}[^>]*>`, 'g'), '');
    result = result.replace(new RegExp(`</${tag}>`, 'g'), '');
  }
  return result;
}

/**
 * 为数学运行构建 <a:rPr>。PowerPoint 需要 Cambria Math 字体。
 * @param szHundredths - 以百分之一磅为单位的字号（如 1200 = 12pt）。省略则不设置 sz。
 */
function buildMathRPr(szHundredths?: number): string {
  const szAttr = szHundredths ? ` sz="${szHundredths}"` : '';
  return (
    `<a:rPr lang="en-US" i="1"${szAttr}>` +
    '<a:latin typeface="Cambria Math" panose="02040503050406030204" charset="0"/>' +
    '<a:cs typeface="Cambria Math" panose="02040503050406030204" charset="0"/>' +
    '</a:rPr>'
  );
}

/**
 * 对 OMML 进行后处理以确保 PPTX 兼容性：
 * 1. 移除 xmlns:w（wordprocessingml 仅用于 DOCX，在 PPTX 中无效）
 * 2. 移除冗余的 xmlns:m（已在 <p:sld> 层级声明）
 * 3. 将包含 Cambria Math 字体（和可选 sz）的 <a:rPr> 注入到 <m:r> 和 <m:ctrlPr> 中
 */
function postProcessOmml(omml: string, szHundredths?: number): string {
  let result = omml;
  const rpr = buildMathRPr(szHundredths);

  // 从 <m:oMath> 中移除仅用于 DOCX 的 xmlns:w 和冗余的 xmlns:m
  result = result.replace(/ xmlns:w="[^"]*"/g, '');
  result = result.replace(/ xmlns:m="[^"]*"/g, '');

  // 在 <m:r> 内的 <m:t> 前插入 <a:rPr>（仅当不存在时）
  result = result.replace(/<m:r>(\s*)<m:t/g, `<m:r>$1${rpr}$1<m:t`);

  // 用 <a:rPr> 填充空的 <m:ctrlPr/>
  result = result.replace(/<m:ctrlPr\/>/g, `<m:ctrlPr>${rpr}</m:ctrlPr>`);

  // 用 <a:rPr> 填充空的 <m:ctrlPr></m:ctrlPr>
  result = result.replace(/<m:ctrlPr><\/m:ctrlPr>/g, `<m:ctrlPr>${rpr}</m:ctrlPr>`);

  return result;
}

/**
 * 将 LaTeX 字符串转换为 OMML（Office Math Markup Language）XML。
 *
 * 流水线：LaTeX → MathML (temml) → 移除不支持元素 → OMML (mathml2omml) → 注入字体属性
 *
 * @param latex - LaTeX 数学表达式（不含分隔符）
 * @param fontSize - 可选字号（单位：磅，如 12）。应用到 OMML 中每个 <a:rPr> 的 sz 属性。
 * @returns OMML XML 字符串（一个 `<m:oMath>` 元素），转换失败时返回 `null`
 */
export function latexToOmml(latex: string, fontSize?: number): string | null {
  try {
    const mathml = temml.renderToString(latex);
    const cleaned = stripUnsupportedMathML(mathml);
    const omml = mml2omml(cleaned);
    const szHundredths = fontSize ? Math.round(fontSize * 100) : undefined;
    return postProcessOmml(omml, szHundredths);
  } catch {
    log.warn(`Failed to convert: "${latex}"`);
    return null;
  }
}
