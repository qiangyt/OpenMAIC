/**
 * 互动 HTML 后处理器
 *
 * 移植自 Python 的 PostProcessor 类 (learn-your-way/concept_to_html.py:287-385)
 *
 * 处理:
 * - LaTeX 分隔符转换 ($$...$$ -> \[...\], $...$ -> \(...\))
 * - KaTeX CSS/JS 注入，包含自动渲染和 MutationObserver
 * - LaTeX 转换期间的 script 标签保护
 */

/**
 * 主入口点: 后处理生成的互动 HTML
 * 转换 LaTeX 分隔符并注入 KaTeX 渲染资源。
 */
export function postProcessInteractiveHtml(html: string): string {
  // 转换 LaTeX 分隔符，同时保护 script 标签
  let processed = convertLatexDelimiters(html);

  // 如果尚未存在 KaTeX 资源，则注入
  if (!processed.toLowerCase().includes('katex')) {
    processed = injectKatex(processed);
  }

  return processed;
}

/**
 * 转换 LaTeX 分隔符，同时保护 <script> 标签。
 *
 * - 保护 script 块不被修改
 * - 将 $$...$$ 转换为 \[...\]（展示公式）
 * - 将 $...$ 转换为 \(...\)（行内公式）
 * - 转换后恢复 script 块
 */
function convertLatexDelimiters(html: string): string {
  const scriptBlocks: string[] = [];

  // 通过用占位符替换 script 标签来保护它们
  let processed = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    scriptBlocks.push(match);
    return `__SCRIPT_BLOCK_${scriptBlocks.length - 1}__`;
  });

  // 转换展示公式: $$...$$ -> \[...\]
  processed = processed.replace(/\$\$([^$]+)\$\$/g, '\\[$1\\]');

  // 转换行内公式: $...$ -> \(...\)
  // 使用非贪婪匹配并排除换行符以避免误匹配
  processed = processed.replace(/\$([^$\n]+?)\$/g, '\\($1\\)');

  // 使用 indexOf + substring 恢复 script 块（而不是 .replace()）
  // 因为 script 内容可能包含 $ 字符，.replace() 会将它们
  // 解释为特殊的替换模式。
  for (let i = 0; i < scriptBlocks.length; i++) {
    const placeholder = `__SCRIPT_BLOCK_${i}__`;
    const idx = processed.indexOf(placeholder);
    if (idx !== -1) {
      processed =
        processed.substring(0, idx) +
        scriptBlocks[i] +
        processed.substring(idx + placeholder.length);
    }
  }

  return processed;
}

/**
 * 在 </head> 之前注入 KaTeX CSS、JS、auto-render 和 MutationObserver。
 * 如果找不到 </head>，则回退到追加到末尾。
 */
function injectKatex(html: string): string {
  const katexInjection = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {
    const katexOptions = {
        delimiters: [
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false},
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
        ],
        throwOnError: false,
        strict: false,
        trust: true
    };

    let renderTimeout;
    function safeRender() {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            renderMathInElement(document.body, katexOptions);
        }, 100);
    }

    renderMathInElement(document.body, katexOptions);

    const observer = new MutationObserver((mutations) => {
        let shouldRender = false;
        mutations.forEach((mutation) => {
            if (mutation.target &&
                mutation.target.className &&
                typeof mutation.target.className === 'string' &&
                mutation.target.className.includes('katex')) {
                return;
            }
            shouldRender = true;
        });

        if (shouldRender) {
            safeRender();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    setInterval(() => {
        const text = document.body.innerText;
        if (text.includes('\\\\(') || text.includes('$$')) {
            safeRender();
        }
    }, 2000);
});
</script>`;

  // 使用 indexOf + substring 而不是 String.replace()，因为
  // katexInjection 字符串包含 '$' 字符，.replace() 会
  // 将其解释为特殊的替换模式（$$ → $, $' → 匹配后的文本）。
  const headCloseIdx = html.indexOf('</head>');
  if (headCloseIdx !== -1) {
    return (
      html.substring(0, headCloseIdx) +
      katexInjection +
      '\n</head>' +
      html.substring(headCloseIdx + 7)
    );
  }

  // 回退: 如果缺少 </head>，则注入到 </body> 之前
  const bodyCloseIdx = html.indexOf('</body>');
  if (bodyCloseIdx !== -1) {
    return (
      html.substring(0, bodyCloseIdx) +
      katexInjection +
      '\n</body>' +
      html.substring(bodyCloseIdx + 7)
    );
  }

  // 最后手段: 追加到末尾
  return html + katexInjection;
}
