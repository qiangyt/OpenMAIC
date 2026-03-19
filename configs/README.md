# 共享配置模块 (configs/)

> 幻灯片编辑器和演示的配置常量

## 概览

本目录包含幻灯片编辑器、演示模式和内容生成相关的配置常量。这些配置在客户端和服务端之间共享。

```
configs/
├── symbol.ts        # 特殊符号列表
├── theme.ts         # 预设主题配置
├── latex.ts         # LaTeX 公式配置
├── font.ts          # 字体配置
├── hotkey.ts        # 快捷键定义
├── storage.ts       # 存储键常量
├── shapes.ts        # 形状预设
├── lines.ts         # 线条预设
├── chart.ts         # 图表配置
├── animation.ts     # 动画配置
├── mime.ts          # MIME 类型映射
├── image-clip.ts    # 图片裁剪形状
└── element.ts       # 元素配置
```

## 核心配置文件

### theme.ts - 预设主题

```typescript
import { PRESET_THEMES } from '@/configs/theme';

// 16 种预设主题
PRESET_THEMES[0] = {
  background: '#ffffff',
  fontColor: '#333333',
  borderColor: '#41719c',
  fontname: '',
  colors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
};
```

| 属性 | 说明 |
|------|------|
| `background` | 幻灯片背景色 |
| `fontColor` | 默认字体颜色 |
| `borderColor` | 边框/强调色 |
| `colors` | 调色板（6 色） |

### animation.ts - 动画配置

```typescript
import {
  ENTER_ANIMATIONS,
  EXIT_ANIMATIONS,
  ATTENTION_ANIMATIONS,
  SLIDE_ANIMATIONS,
} from '@/configs/animation';

// 基于 Animate.css 的动画效果
ENTER_ANIMATIONS: [
  { type: 'bounce', name: '弹跳', children: [...] },
  { type: 'fade', name: '浮现', children: [...] },
  { type: 'rotate', name: '旋转', children: [...] },
  { type: 'zoom', name: '缩放', children: [...] },
  ...
]
```

| 常量 | 说明 |
|------|------|
| `ENTER_ANIMATIONS` | 进入动画（8 类） |
| `EXIT_ANIMATIONS` | 退出动画（8 类） |
| `ATTENTION_ANIMATIONS` | 强调动画（2 类） |
| `SLIDE_ANIMATIONS` | 幻灯片切换动画（12 种） |
| `ANIMATION_DEFAULT_DURATION` | 默认动画时长（1000ms） |

### chart.ts - 图表配置

```typescript
import { CHART_TYPE_MAP, CHART_DEFAULT_DATA, CHART_PRESET_THEMES } from '@/configs/chart';

// 支持的图表类型
CHART_TYPE_MAP = {
  bar: '柱状图',
  column: '条形图',
  line: '折线图',
  area: '面积图',
  scatter: '散点图',
  pie: '饼图',
  ring: '环形图',
  radar: '雷达图',
};

// 每种图表的默认数据模板
CHART_DEFAULT_DATA['bar'] = { labels: [...], legends: [...], series: [[...], [...]] };

// 12 种预设图表配色主题
CHART_PRESET_THEMES = [
  ['#d87c7c', '#919e8b', '#d7ab82', ...],
  ...
];
```

### latex.ts - LaTeX 配置

```typescript
import { FORMULA_LIST, SYMBOL_LIST } from '@/configs/latex';

// 预设公式
FORMULA_LIST = [
  { label: '高斯公式', latex: '\\int\\int\\int...' },
  { label: '傅里叶级数', latex: 'f(x) = \\frac{a_0} 2 + ...' },
  { label: '泰勒展开式', latex: 'e^x = 1 + \\frac{x}{1!} + ...' },
  ...
];

// LaTeX 符号分类
SYMBOL_LIST = [
  { type: 'operators', label: '数学', children: [...] },
  { type: 'group', label: '组合', children: [...] },
  { type: 'verbatim', label: '函数', children: [...] },
  { type: 'greek', label: '希腊字母', children: [...] },
];
```

### hotkey.ts - 快捷键定义

```typescript
import { KEYS, HOTKEY_DOC } from '@/configs/hotkey';

// 按键枚举
export const enum KEYS {
  C = 'C', X = 'X', Z = 'Z', Y = 'Y', ...
  ENTER = 'ENTER', SPACE = ' ', TAB = 'TAB', ...
}

// 快捷键文档（中文）
HOTKEY_DOC = [
  { type: '通用', children: [{ label: '剪切', value: 'Ctrl + X' }, ...] },
  { type: '幻灯片放映', children: [...] },
  { type: '幻灯片编辑', children: [...] },
  { type: '元素操作', children: [...] },
  { type: '表格编辑', children: [...] },
  { type: '文本编辑', children: [...] },
];
```

### image-clip.ts - 图片裁剪形状

```typescript
import { CLIPPATHS, ClipPathTypes } from '@/configs/image-clip';

// 预设裁剪形状
CLIPPATHS = {
  rect: { name: '矩形', type: ClipPathTypes.RECT, ... },
  roundRect: { name: '圆角矩形', type: ClipPathTypes.RECT, radius: '10px' },
  ellipse: { name: '圆形', type: ClipPathTypes.ELLIPSE, ... },
  triangle: { name: '三角形', type: ClipPathTypes.POLYGON, ... },
  rhombus: { name: '菱形', ... },
  pentagon: { name: '五边形', ... },
  hexagon: { name: '六边形', ... },
  arrow: { name: '箭头', ... },
  ...
}
```

支持 18 种裁剪形状，包括矩形、圆形、三角形、多边形、箭头等。

### lines.ts - 线条预设

```typescript
import { LINE_LIST } from '@/configs/lines';

LINE_LIST = [
  { type: '直线', children: [
    { path: 'M 0 0 L 20 20', style: 'solid', points: ['', ''] },
    { path: 'M 0 0 L 20 20', style: 'dashed', points: ['', 'arrow'] },
    ...
  ]},
  { type: '折线、曲线', children: [
    { path: 'M 0 0 L 0 20 L 20 20', style: 'solid', isBroken: true, ... },
    { path: 'M 0 0 Q 0 20 20 20', style: 'solid', isCurve: true, ... },
    ...
  ]},
];
```

### symbol.ts - 特殊符号

```typescript
import { SYMBOL_LIST } from '@/configs/symbol';

// 符号分类
SYMBOL_LIST = [
  { key: 'letter', label: '字母', children: [
    ['α', 'β', 'γ', 'δ', ...], // 希腊小写
    ['Γ', 'Δ', 'Θ', ...],       // 希腊大写
    ['𝐀', '𝐁', '𝐂', ...],       // 粗体字母
    ...
  ]},
  { key: 'number', label: '序号', children: [...] },
  { key: 'math', label: '数学', children: [...] },
  { key: 'arrow', label: '箭头', children: [...] },
  { key: 'graph', label: '图形', children: [...] },
  { key: 'emoji', label: 'Emoji', children: [...] },
];
```

### font.ts - 字体配置

```typescript
import { FONTS } from '@/configs/font';

// 预设字体列表
FONTS = [
  { label: '默认字体', value: '' },
  { label: '思源黑体', value: 'SourceHanSans' },
  { label: '思源宋体', value: 'SourceHanSerif' },
  { label: '霞鹜文楷', value: 'LXGWWenKai' },
  { label: 'MiSans', value: 'MiSans' },
  ...
  { label: 'Inter', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
];
```

支持 30 种预设字体，包括中文开源字体和西文字体。

### element.ts - 元素配置

```typescript
import { ELEMENT_TYPE_ZH, MIN_SIZE } from '@/configs/element';

// 元素类型中文映射
ELEMENT_TYPE_ZH = {
  text: '文本',
  image: '图片',
  shape: '形状',
  line: '线条',
  chart: '图表',
  table: '表格',
  video: '视频',
  audio: '音频',
  latex: '公式',
};

// 元素最小尺寸（像素）
MIN_SIZE = {
  text: 40,
  image: 20,
  shape: 20,
  chart: 200,
  table: 30,
  video: 250,
  audio: 20,
  latex: 20,
};
```

### mime.ts - MIME 类型映射

```typescript
import { MIME_MAP } from '@/configs/mime';

// 音视频 MIME 类型到扩展名映射
MIME_MAP = {
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  ...
};
```

### storage.ts - 存储键常量

```typescript
import { LOCALSTORAGE_KEY_DISCARDED_DB } from '@/configs/storage';

// IndexedDB 废弃标记键
LOCALSTORAGE_KEY_DISCARDED_DB = 'MAIC_DISCARDED_DB';
```

## 设计原则

1. **集中管理**: 所有配置常量集中在 configs/ 目录
2. **类型安全**: 使用 TypeScript 类型和接口定义
3. **可扩展**: 易于添加新的预设主题、动画、形状等
4. **国际化就绪**: 支持中文标签，便于本地化

## 与其他模块的关系

```
configs/
    │
    ├── 被依赖: components/slide-renderer/* (幻灯片渲染)
    │         lib/store/* (状态管理)
    │         lib/types/slides.ts (类型定义)
    │
    └── 依赖: lib/types/slides.ts (类型引用)
```
