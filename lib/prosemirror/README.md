# ProseMirror 富文本编辑模块 (lib/prosemirror/)

> 基于 ProseMirror 的富文本编辑器抽象层

## 概览

本模块封装了 ProseMirror 编辑器的核心功能，提供富文本编辑能力，用于课件中的文本元素编辑。

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProseMirror Editor                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Schema 定义                          │   │
│  │  ┌──────────────┐  ┌──────────────────────────────┐     │   │
│  │  │    Nodes     │  │           Marks              │     │   │
│  │  │ - paragraph  │  │ - strong/em/underline       │     │   │
│  │  │ - bullet_list│  │ - forecolor/backcolor       │     │   │
│  │  │ - ordered_list│ │ - fontsize/fontname         │     │   │
│  │  │ - blockquote │  │ - link/subscript/superscript│     │   │
│  │  └──────────────┘  └──────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Plugins                              │   │
│  │  - keymap (快捷键)      - history (撤销/重做)            │   │
│  │  - inputrules (输入规则) - placeholder (占位符)          │   │
│  │  - dropCursor (拖放光标) - gapCursor (间隙光标)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Commands                             │   │
│  │  - setTextAlign (对齐)   - toggleList (列表切换)         │   │
│  │  - setTextIndent (缩进)  - setListStyle (列表样式)       │   │
│  │  - replaceText (替换文本)                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `index.ts` | 编辑器初始化入口 |
| `schema/nodes.ts` | 节点类型定义（段落、列表等） |
| `schema/marks.ts` | 标记类型定义（粗体、颜色等） |
| `plugins/index.ts` | 插件构建器 |
| `plugins/keymap.ts` | 快捷键映射 |
| `plugins/inputrules.ts` | 输入规则（Markdown 快捷方式） |
| `plugins/placeholder.ts` | 占位符插件 |
| `commands/*.ts` | 编辑命令实现 |
| `utils.ts` | 工具函数（状态查询、Mark 操作） |

## Schema 定义

### 节点类型 (Nodes)

```typescript
// schema/nodes.ts
const schemaNodes = {
  doc,           // 文档根节点
  paragraph,     // 段落 - 支持对齐、缩进
  blockquote,    // 引用块
  text,          // 文本节点
  ordered_list,  // 有序列表 - 支持起始编号、样式
  bullet_list,   // 无序列表 - 支持列表样式
  list_item,     // 列表项
};

// 段落属性
interface ParagraphAttrs {
  align: 'left' | 'right' | 'center' | 'justify' | '';
  indent: number;        // 左缩进级别
  textIndent: number;    // 首行缩进 (em)
}

// 列表属性
interface ListAttrs {
  order?: number;          // 有序列表起始编号
  listStyleType: string;   // 列表样式 (disc, decimal, etc.)
  fontsize: string;        // 字体大小
  color: string;           // 文字颜色
}
```

### 标记类型 (Marks)

```typescript
// schema/marks.ts
const schemaMarks = {
  em,             // 斜体
  strong,         // 粗体
  code,           // 行内代码
  underline,      // 下划线
  strikethrough,  // 删除线
  subscript,      // 下标
  superscript,    // 上标
  forecolor,      // 文字颜色
  backcolor,      // 背景颜色
  fontsize,       // 字体大小
  fontname,       // 字体名称
  link,           // 超链接
  mark,           // 高亮标记 (用于搜索高亮等)
};

// 链接属性
interface LinkAttrs {
  href: string;
  title?: string;
  target?: string;  // 默认 '_blank'
}

// 高亮标记属性
interface MarkAttrs {
  index: string | null;  // 用于关联高亮
}
```

## 编辑器初始化

```typescript
// index.ts
import { initProsemirrorEditor, createDocument } from '@/lib/prosemirror';

// 初始化编辑器
const editorView = initProsemirrorEditor(
  document.getElementById('editor'),
  '<p>初始内容</p>',
  {
    // DirectEditorProps
    dispatchTransaction: (tr) => { ... },
    handleDOMEvents: { ... },
  },
  {
    // PluginOptions
    placeholder: '请输入内容...',
  }
);

// 从 HTML 创建文档
const doc = createDocument('<p>Hello <strong>World</strong></p>');
```

## 插件系统

### 插件构建

```typescript
// plugins/index.ts
export interface PluginOptions {
  placeholder?: string;
}

export const buildPlugins = (schema: Schema, options?: PluginOptions) => {
  const plugins = [
    buildInputRules(schema),  // Markdown 输入规则
    keymap(buildKeymap(schema)),  // 自定义快捷键
    keymap(baseKeymap),       // 基础快捷键
    dropCursor(),             // 拖放时光标
    gapCursor(),              // 间隙光标
    history(),                // 撤销/重做
  ];

  if (options?.placeholder) {
    plugins.push(placeholderPlugin(options.placeholder));
  }

  return plugins;
};
```

### 输入规则示例

```typescript
// plugins/inputrules.ts
// 输入特定字符自动转换格式
// 例如：
// **text** → 粗体
// *text* → 斜体
// `text` → 代码
// 1. → 有序列表
// - 或 * → 无序列表
// > → 引用块
```

## 编辑命令

### 文本对齐

```typescript
import { alignmentCommand } from './commands/setTextAlign';

// 设置对齐方式
alignmentCommand(editorView, 'center');  // 居中
alignmentCommand(editorView, 'left');    // 左对齐
alignmentCommand(editorView, 'right');   // 右对齐
alignmentCommand(editorView, 'justify'); // 两端对齐
```

### 列表切换

```typescript
import { toggleList } from './commands/toggleList';

const { bullet_list, ordered_list, list_item } = schema.nodes;

// 切换无序列表
toggleList(bullet_list, list_item, 'disc')(state, dispatch);

// 切换有序列表
toggleList(ordered_list, list_item, 'decimal')(state, dispatch);

// 自定义列表样式
toggleList(bullet_list, list_item, 'circle', { color: '#ff0000' })(state, dispatch);
```

### 缩进控制

```typescript
import { setTextIndent } from './commands/setTextIndent';

// 设置首行缩进
setTextIndent(tr, schema, 2);  // 缩进 2em
```

### 列表样式

```typescript
import { setListStyle } from './commands/setListStyle';

// 设置列表样式
setListStyle(editorView, 'lower-roman');  // i, ii, iii...
```

## 工具函数 (utils.ts)

### 状态查询

```typescript
// 获取当前文本属性
const attrs = getTextAttrs(editorView);
// 返回:
// {
//   bold: boolean,
//   em: boolean,
//   underline: boolean,
//   strikethrough: boolean,
//   superscript: boolean,
//   subscript: boolean,
//   code: boolean,
//   color: string,       // 文字颜色
//   backcolor: string,   // 背景颜色
//   fontsize: string,    // 字体大小
//   fontname: string,    // 字体名称
//   link: string,        // 链接地址
//   align: 'left' | 'right' | 'center',
//   bulletList: boolean,
//   orderedList: boolean,
//   blockquote: boolean,
// }

// 获取当前字体大小
const fontSize = getFontsize(editorView);  // 返回数字

// 检查 Mark 是否激活
const isBold = isActiveMark(marks, 'strong');
```

### Mark 操作

```typescript
// 添加 Mark
import { addMark } from './utils';
import { schema } from './schema';

const mark = schema.marks.strong.create();
addMark(editorView, mark);

// 添加到指定范围
addMark(editorView, mark, { from: 10, to: 20 });

// 检查 Mark 在选区是否激活
import { markActive } from './utils';
const isActive = markActive(state, schema.marks.em);
```

### 节点查找

```typescript
// 查找父节点
import { findParentNode, findParentNodeOfType } from './utils';

// 查找满足条件的父节点
const parent = findParentNode(node => node.type.name === 'paragraph')(selection);

// 查找特定类型的父节点
const listParent = findParentNodeOfType(schema.nodes.bullet_list)(selection);

// 检查当前是否在特定节点内
import { isActiveOfParentNodeType } from './utils';
const isInList = isActiveOfParentNodeType('bullet_list', state);
```

### 查找相同 Mark 的节点范围

```typescript
import { findNodesWithSameMark } from './utils';

// 查找具有相同链接 Mark 的文本范围
const result = findNodesWithSameMark(
  doc,
  from,
  to,
  schema.marks.link
);
// 返回: { mark, from: { node, pos }, to: { node, pos } }
```

## 默认属性值

```typescript
// utils.ts
export const defaultRichTextAttrs: TextAttrs = {
  bold: false,
  em: false,
  underline: false,
  strikethrough: false,
  superscript: false,
  subscript: false,
  code: false,
  color: '#000000',
  backcolor: '',
  fontsize: '16px',
  fontname: '',
  link: '',
  align: 'left',
  bulletList: false,
  orderedList: false,
  blockquote: false,
};
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/prosemirror/                         │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - prosemirror-state (编辑器状态)                               │
│  - prosemirror-view (编辑器视图)                                │
│  - prosemirror-model (文档模型)                                 │
│  - prosemirror-schema-basic (基础 Schema)                       │
│  - prosemirror-schema-list (列表 Schema)                        │
│  - prosemirror-keymap (快捷键)                                  │
│  - prosemirror-history (历史记录)                               │
│  - prosemirror-commands (基础命令)                              │
│  - prosemirror-dropcursor (拖放光标)                            │
│  - prosemirror-gapcursor (间隙光标)                             │
│                                                                 │
│  被依赖:                                                        │
│  - components/ (富文本编辑器组件)                               │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用自定义 Schema 而非默认？

1. **扩展属性**: 段落支持对齐、缩进等属性
2. **样式保留**: 列表保留字体大小、颜色等样式
3. **高亮支持**: 自定义 mark 节点支持搜索高亮

### 为什么 Mark 和 Node 分离？

1. **语义清晰**: Mark 是文本样式，Node 是结构元素
2. **嵌套灵活**: 多个 Mark 可以叠加在同一个文本上
3. **标准模式**: ProseMirror 推荐的数据模型

### 为什么提供 getTextAttrs 工具函数？

1. **工具栏状态**: 快速获取当前选区的所有格式状态
2. **统一接口**: 一次调用获取所有属性，避免多次查询
3. **默认值处理**: 自动填充默认值，简化调用方逻辑
