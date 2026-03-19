# 工作区包 (packages/)

> pnpm 工作区独立包

## 概览

本目录包含 pnpm 工作区的独立包，每个包都有自己的 `package.json` 和构建配置。

```
packages/
├── mathml2omml/   # MathML 转 OMML 转换器
└── pptxgenjs/     # PowerPoint 生成库
```

## mathml2omml

MathML 到 Office Math ML (OMML) 的转换器。

### 来源
- Fork 自 [fiduswriter/mathml2omml](https://github.com/fiduswriter/mathml2omml)
- 许可证: LGPL-3.0-or-later

### 功能
- 将 MathML 格式的数学公式转换为 Microsoft Office 的 OMML 格式
- 用于在导出 PPTX 时嵌入公式

### 使用

```typescript
import { mathml2omml } from 'mathml2omml';

const mathml = '<math><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math>';
const omml = mathml2omml(mathml);
// 返回 Office Math ML XML
```

## pptxgenjs

JavaScript PowerPoint 生成库。

### 来源
- Fork 自 [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS)
- 许可证: MIT
- 版本: 4.0.1

### 功能
- 创建 PowerPoint 演示文稿
- 支持文本、图片、图表、表格、形状
- 纯 JavaScript，无需服务器

### 使用

```typescript
import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';

const slide = pptx.addSlide();
slide.addText('Hello World', {
  x: 0.5, y: 0.5, w: '90%', h: 1,
  fontSize: 36, bold: true,
});

// 导出
const blob = await pptx.write({ outputType: 'blob' });
```

### 定制内容
- 本仓库可能包含针对 OpenMAIC 的定制修改
- 支持 SVG 图片转换
- 支持 LaTeX 公式（通过 OMML）

## 构建说明

```bash
# 构建所有包
pnpm --filter mathml2omml build
pnpm --filter pptxgenjs build

# 或在根目录
pnpm build:packages
```
