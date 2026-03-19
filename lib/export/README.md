# 导出模块 (lib/export/)

> PPT 课件导出为 PowerPoint 格式

## 概览

本模块实现了将 OpenMAIC 课件导出为 PPTX (PowerPoint) 格式的功能，包括元素转换、样式映射、媒体嵌入等。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Export Module                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  use-export-pptx.ts (主 Hook)                                   │
│       │                                                         │
│       ├── html-parser/ (HTML → AST 解析)                        │
│       │   ├── lexer.ts    (词法分析)                            │
│       │   ├── parser.ts   (语法分析)                            │
│       │   ├── format.ts   (格式化)                              │
│       │   └── stringify.ts (序列化)                             │
│       │                                                         │
│       ├── svg-path-parser.ts (SVG 路径解析)                     │
│       ├── svg2base64.ts     (SVG 转 Base64)                     │
│       └── latex-to-omml.ts  (LaTeX 转 Office Math)              │
│                                                                 │
│  输入: OpenMAIC 场景 (Scene/Slide)                              │
│  输出: PPTX Blob                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `use-export-pptx.ts` | PPTX 导出主 Hook |
| `html-parser/index.ts` | HTML 解析入口 |
| `html-parser/lexer.ts` | HTML 词法分析器 |
| `html-parser/parser.ts` | HTML 语法分析器 |
| `html-parser/format.ts` | AST 格式化 |
| `html-parser/stringify.ts` | AST 序列化回 HTML |
| `svg-path-parser.ts` | SVG path 解析和转换 |
| `svg2base64.ts` | SVG 转 Base64 图片 |
| `latex-to-omml.ts` | LaTeX 公式转 Office Math ML |

## 导出 Hook (use-export-pptx.ts)

### 使用方式

```typescript
import { useExportPPTX } from '@/lib/export/use-export-pptx';

function ExportButton() {
  const { exportPPTX, exporting, progress } = useExportPPTX();

  const handleExport = async () => {
    await exportPPTX({
      fileName: '我的课件.pptx',
      includeNotes: true,  // 包含演讲者备注
    });
  };

  return (
    <button onClick={handleExport} disabled={exporting}>
      {exporting ? `导出中 ${progress}%` : '导出 PPTX'}
    </button>
  );
}
```

### 导出选项

```typescript
interface ExportOptions {
  fileName?: string;      // 输出文件名，默认 'presentation.pptx'
  includeNotes?: boolean; // 是否包含演讲者备注，默认 true
}

interface ExportResult {
  success: boolean;
  blob?: Blob;           // PPTX 文件 Blob
  error?: string;
}
```

### 导出流程

```
exportPPTX()
    │
    ├── 1. 收集场景数据
    │   └── useStageStore → scenes, slides
    │
    ├── 2. 初始化 pptxgenjs
    │   └── 根据宽高比设置布局 (16:9 / 4:3 / 16:10)
    │
    ├── 3. 逐场景转换
    │   ├── 设置幻灯片背景
    │   ├── 转换各元素
    │   │   ├── text   → addText()
    │   │   ├── image  → addImage()
    │   │   ├── shape  → addShape()
    │   │   ├── chart  → addChart()
    │   │   ├── table  → addTable()
    │   │   ├── latex  → addText(OMML)
    │   │   ├── video  → addMedia() / 静态图
    │   │   └── line   → addShape()
    │   └── 添加演讲者备注
    │
    ├── 4. 生成 Blob
    │   └── pptx.write({ outputType: 'blob' })
    │
    └── 5. 触发下载
        └── saveAs(blob, fileName)
```

## HTML 解析器 (html-parser/)

### 解析流程

```typescript
import { toAST, toHTML, type AST } from '@/lib/export/html-parser';

// HTML → AST
const ast = toAST('<p style="color:red">Hello <strong>World</strong></p>');

// AST 结构
// {
//   type: 'element',
//   tagName: 'p',
//   attributes: [{ key: 'style', value: 'color:red' }],
//   children: [
//     { type: 'text', content: 'Hello ' },
//     { type: 'element', tagName: 'strong', children: [
//       { type: 'text', content: 'World' }
//     ], attributes: [] }
//   ]
// }

// AST → HTML
const html = toHTML(ast);
```

### AST 类型定义

```typescript
// html-parser/types.ts

interface ElementAST {
  type: 'element';
  tagName: string;
  children: AST[];
  attributes: ElementAttribute[];
}

interface CommentOrTextAST {
  type: 'comment' | 'text';
  content: string;
}

type AST = CommentOrTextAST | ElementAST;

interface ElementAttribute {
  key: string;
  value: string | null;
}
```

### 与 pptxgenjs 集成

```typescript
// 将 HTML 富文本转换为 pptxgenjs TextProps
function formatHTML(html: string, ratioPx2Pt: number): TextProps[] {
  const ast = toAST(html);
  const slices: TextProps[] = [];

  // 递归解析 AST
  const parse = (obj: AST[], baseStyleObj: Record<string, string> = {}) => {
    for (const item of obj) {
      // 提取样式属性
      // 处理 <strong>, <em>, <sup>, <sub>, <a>, <ul>, <ol>, <li> 等标签
      // 转换为 pptxgenjs 选项
    }
  };

  parse(ast);
  return slices;
}

// 示例输出
[
  { text: 'Hello ', options: { fontSize: 12 } },
  { text: 'World', options: { fontSize: 12, bold: true } },
]
```

## SVG 路径解析 (svg-path-parser.ts)

```typescript
import { parseSvgPath, toPoints, getSvgPathRange, type SvgPoints } from '@/lib/export/svg-path-parser';

// 解析 SVG path d 属性
const path = parseSvgPath('M 0 0 L 100 100 Q 150 50 200 100');
// [{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 100, y: 100 }, { type: 'Q', ... }]

// 转换为点数组（圆弧转贝塞尔曲线）
const points = toPoints('M 0 0 A 50 50 0 0 1 100 100');
// 圆弧 A 自动转换为三次贝塞尔 C

// 获取路径边界
const range = getSvgPathRange('M 0 0 L 100 50');
// { minX: 0, minY: 0, maxX: 100, maxY: 50 }
```

### 支持的路径命令

| 命令 | 说明 | 转换处理 |
|------|------|---------|
| M | 移动 | 直接使用 |
| L | 直线 | 直接使用 |
| C | 三次贝塞尔 | 直接使用 |
| Q | 二次贝塞尔 | 直接使用 |
| A | 圆弧 | 转换为三次贝塞尔 |
| Z | 闭合 | 直接使用 |

## SVG 转 Base64 (svg2base64.ts)

```typescript
import { svg2Base64 } from '@/lib/export/svg2base64';

// 将 SVG 字符串转换为 Base64 Data URL
const dataUrl = svg2Base64('<svg>...</svg>');
// "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i..."

// 用途：在 PPTX 中嵌入 SVG
pptxSlide.addImage({
  data: dataUrl,
  x: 0, y: 0, w: 10, h: 7.5,
});
```

## LaTeX 转 OMML (latex-to-omml.ts)

```typescript
import { latexToOmml } from '@/lib/export/latex-to-omml';

// LaTeX 公式转 Office Math ML
const omml = latexToOmml('\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}');
// 返回 Office Math ML XML 字符串

// 在 PPTX 中使用
pptxSlide.addText([
  { text: '公式: ', options: { fontSize: 14 } },
  { text: omml, options: { fontSize: 14 } },
]);
```

## 元素转换映射

### 文本元素 (text)

```typescript
// OpenMAIC TextElement → pptxgenjs TextProps
{
  type: 'text',
  content: '<p>Hello</p>',
  left: 100, top: 100,
  width: 400, height: 50,
  defaultFontName: 'Microsoft YaHei',
  defaultColor: '#333333',
  rotate: 0,
  lineHeight: 1.5,
  wordSpace: 0,
  fill: '#ffffff',
  shadow: { ... },
  outline: { ... },
}
// ↓ 转换为 ↓
pptxSlide.addText(textProps, {
  x: 100 / ratioPx2Inch,
  y: 100 / ratioPx2Inch,
  w: 400 / ratioPx2Inch,
  h: 50 / ratioPx2Inch,
  fontFace: 'Microsoft YaHei',
  color: '#333333',
  rotate: 0,
  lineSpacingMultiple: 1.5 / 1.25,
  fill: { color: '#ffffff' },
  shadow: { ... },
  line: { ... },
});
```

### 图片元素 (image)

```typescript
// OpenMAIC ImageElement → pptxgenjs ImageProps
{
  type: 'image',
  src: 'https://example.com/image.png',  // 或 blob:URL 或 base64
  left: 100, top: 100,
  width: 300, height: 200,
  rotate: 0,
  filters: { grayscale: false, ... },
}
// ↓ 转换为 ↓
// 1. 解析媒体占位符 (gen_img_xxx)
// 2. 获取实际图片数据
// 3. 转换为 base64
pptxSlide.addImage({
  data: base64Data,
  x: 100 / ratioPx2Inch,
  y: 100 / ratioPx2Inch,
  w: 300 / ratioPx2Inch,
  h: 200 / ratioPx2Inch,
  rotate: 0,
});
```

### 形状元素 (shape)

```typescript
// OpenMAIC ShapeElement → pptxgenjs ShapeProps
{
  type: 'shape',
  path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
  left: 100, top: 100,
  width: 200, height: 150,
  fill: '#4F46E5',
  outline: { color: '#000', width: 2, style: 'solid' },
}
// ↓ 转换为 ↓
pptxSlide.addShape(pptxgen.shapes.PATH, {
  x: 100 / ratioPx2Inch,
  y: 100 / ratioPx2Inch,
  w: 200 / ratioPx2Inch,
  h: 150 / ratioPx2Inch,
  fill: { color: '#4F46E5' },
  line: { color: '#000000', width: 2 / ratioPx2Pt, dashType: 'solid' },
  path: svgPathToPptxPath,
});
```

### 图表元素 (chart)

```typescript
// OpenMAIC ChartElement → pptxgenjs ChartProps
{
  type: 'chart',
  chartType: 'bar',
  data: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [{ label: 'Sales', values: [100, 200, 150, 180] }],
  },
  themeColors: ['#4F46E5', '#10B981'],
}
// ↓ 转换为 ↓
pptxSlide.addChart(pptxgen.ChartType.bar, chartData, {
  x, y, w, h,
  chartColors: ['#4F46E5', '#10B981'],
  showLegend: true,
});
```

### 表格元素 (table)

```typescript
// OpenMAIC TableElement → pptxgenjs TableProps
{
  type: 'table',
  data: [[{ text: 'A1' }, { text: 'B1' }], [{ text: 'A2' }, { text: 'B2' }]],
  colWidths: [100, 100],
  theme: { color: '#4F46E5' },
}
// ↓ 转换为 ↓
pptxSlide.addTable(tableData, {
  x, y, w, h,
  colW: [100 / ratioPx2Inch, 100 / ratioPx2Inch],
  fill: { color: themeColor },
  fontFace: 'Microsoft YaHei',
});
```

## 演讲者备注

```typescript
// 从场景动作中提取演讲者备注
function buildSpeakerNotes(scene: Scene): string {
  if (!scene.actions) return '';

  const parts: string[] = [];
  for (const action of scene.actions) {
    if (action.type === 'speech') {
      parts.push(action.text);
    }
  }
  return parts.join('\n');
}

// 添加到幻灯片
pptxSlide.addNotes(notes);
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/export/                              │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - pptxgenjs (PPTX 生成)                                       │
│  - file-saver (文件下载)                                        │
│  - tinycolor2 (颜色处理)                                        │
│  - svg-pathdata (SVG 路径解析)                                  │
│  - svg-arc-to-cubic-bezier (圆弧转贝塞尔)                       │
│  - lib/store/stage.ts (场景数据)                               │
│  - lib/store/canvas.ts (画布配置)                              │
│  - lib/store/media-generation.ts (媒体状态)                     │
│  - lib/types/slides.ts (元素类型)                              │
│  - lib/utils/element.ts (几何计算)                             │
│                                                                 │
│  被依赖:                                                        │
│  - components/ (导出按钮组件)                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用 pptxgenjs 而非其他库？

1. **纯 JavaScript**: 无需服务器端
2. **API 友好**: 链式调用，类型支持
3. **功能完整**: 文本、图片、图表、表格、形状
4. **体积适中**: 适合浏览器环境

### 为什么自己实现 HTML 解析器？

1. **体积控制**: 避免引入大型 HTML 解析库
2. **定制需求**: 只需支持有限的富文本标签
3. **性能优化**: 针对 PPTX 转换场景优化
4. **参考实现**: 基于 himalaya 简化

### 为什么圆弧需要转贝塞尔曲线？

1. **PPTX 限制**: pptxgenjs 不支持圆弧路径
2. **兼容性**: 贝塞尔曲线广泛支持
3. **近似精度**: 可接受的视觉近似

### 为什么图片需要转 base64？

1. **离线可用**: Blob URL 在 PPTX 文件中无效
2. **自包含**: PPTX 文件应包含所有资源
3. **兼容性**: base64 图片嵌入最可靠
