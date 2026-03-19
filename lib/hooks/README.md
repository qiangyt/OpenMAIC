# React Hooks 模块 (lib/hooks/)

> 通用 React 自定义 Hooks

## 概览

本模块提供了一系列可复用的 React Hooks，涵盖画布操作、语音识别/合成、流式文本、国际化等功能。

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/hooks/                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   画布操作                               │   │
│  │  - use-canvas-operations.ts  元素 CRUD 操作             │   │
│  │  - use-order-element.ts      元素排序                   │   │
│  │  - use-slide-background-style.ts 背景样式               │   │
│  │  - use-history-snapshot.ts   历史快照                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   语音功能                               │   │
│  │  - use-browser-tts.ts        浏览器 TTS                 │   │
│  │  - use-browser-asr.ts        浏览器语音识别             │   │
│  │  - use-audio-recorder.ts     音频录制                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   生成相关                               │   │
│  │  - use-scene-generator.ts    场景生成                   │   │
│  │  - use-streaming-text.ts     流式文本显示               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   通用功能                               │   │
│  │  - use-i18n.tsx              国际化                     │   │
│  │  - use-theme.tsx             主题切换                   │   │
│  │  - use-draft-cache.ts        草稿缓存                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `use-canvas-operations.ts` | 画布元素 CRUD 操作 |
| `use-order-element.ts` | 元素层级排序 |
| `use-slide-background-style.ts` | 幻灯片背景样式 |
| `use-history-snapshot.ts` | 撤销/重做历史快照 |
| `use-browser-tts.ts` | 浏览器原生 TTS |
| `use-browser-asr.ts` | 浏览器原生语音识别 |
| `use-audio-recorder.ts` | 音频录制 |
| `use-scene-generator.ts` | 场景内容生成 |
| `use-streaming-text.ts` | 流式文本动画效果 |
| `use-i18n.tsx` | 国际化 (Context + Hook) |
| `use-theme.tsx` | 主题切换 (Context + Hook) |
| `use-draft-cache.ts` | 草稿自动保存 |

## 画布操作 Hook (use-canvas-operations.ts)

### 使用方式

```typescript
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';

function MyComponent() {
  const {
    addElement,
    updateElement,
    deleteElement,
    deleteAllElements,
    removeElementProps,
  } = useCanvasOperations();

  // 添加元素
  const handleAdd = () => {
    addElement({
      id: 'new-1',
      type: 'text',
      content: 'Hello World',
      left: 100,
      top: 100,
      width: 200,
      height: 50,
    });
  };

  // 更新元素
  const handleUpdate = () => {
    updateElement({
      id: 'new-1',
      props: { content: 'Updated Text' },
    });
  };

  // 删除元素
  const handleDelete = () => {
    deleteElement('new-1');
  };
}
```

### API

```typescript
interface CanvasOperations {
  // 添加元素（单个或多个）
  addElement(element: PPTElement | PPTElement[], autoSelect?: boolean): void;

  // 更新元素属性
  updateElement(data: UpdateElementData): void;

  // 删除元素（指定ID或当前选中）
  deleteElement(elementId?: string): void;

  // 删除所有元素
  deleteAllElements(): void;

  // 移除元素特定属性
  removeElementProps(data: RemovePropData): void;

  // 元素排序
  orderElement(command: ElementOrderCommands): void;

  // 元素对齐
  alignElement(command: ElementAlignCommands): void;
}
```

## 浏览器 TTS Hook (use-browser-tts.ts)

### 使用方式

```typescript
import { useBrowserTTS } from '@/lib/hooks/use-browser-tts';

function TTSDemo() {
  const {
    speak,
    pause,
    resume,
    cancel,
    isSpeaking,
    isPaused,
    availableVoices,
  } = useBrowserTTS({
    rate: 1.0,      // 语速 0.1-10
    pitch: 1.0,     // 音调 0-2
    volume: 1.0,    // 音量 0-1
    lang: 'zh-CN',  // 语言
    onStart: () => console.log('开始播放'),
    onEnd: () => console.log('播放结束'),
    onError: (err) => console.error('错误:', err),
  });

  return (
    <div>
      <button onClick={() => speak('你好世界')}>播放</button>
      <button onClick={pause}>暂停</button>
      <button onClick={resume}>继续</button>
      <button onClick={cancel}>取消</button>
      <p>状态: {isSpeaking ? (isPaused ? '已暂停' : '播放中') : '空闲'}</p>

      {/* 选择声音 */}
      <select onChange={(e) => speak('测试', e.target.value)}>
        {availableVoices.map((voice) => (
          <option key={voice.voiceURI} value={voice.voiceURI}>
            {voice.name} ({voice.lang})
          </option>
        ))}
      </select>
    </div>
  );
}
```

### 特点

- **完全免费**: 使用 Web Speech API，无需 API Key
- **实时控制**: 支持暂停、继续、取消
- **多声音**: 获取浏览器可用声音列表
- **SSR 安全**: 自动检测浏览器环境

## 浏览器 ASR Hook (use-browser-asr.ts)

### 使用方式

```typescript
import { useBrowserASR, type ASRErrorCode } from '@/lib/hooks/use-browser-asr';

function ASRDemo() {
  const {
    isSupported,
    isListening,
    interimTranscript,
    startListening,
    stopListening,
  } = useBrowserASR({
    language: 'zh-CN',
    continuous: false,
    interimResults: true,
    onTranscription: (text) => {
      console.log('识别结果:', text);
    },
    onError: (errorCode: ASRErrorCode) => {
      console.error('识别错误:', errorCode);
    },
  });

  if (!isSupported) {
    return <p>浏览器不支持语音识别</p>;
  }

  return (
    <div>
      <button
        onMouseDown={startListening}
        onMouseUp={stopListening}
      >
        {isListening ? '正在听...' : '按住说话'}
      </button>
      {interimTranscript && <p>临时结果: {interimTranscript}</p>}
    </div>
  );
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| `not-supported` | 浏览器不支持 |
| `no-speech` | 未检测到语音 |
| `audio-capture` | 音频捕获失败 |
| `not-allowed` | 用户拒绝麦克风权限 |
| `network` | 网络错误 |
| `aborted` | 用户中止 |
| `unknown` | 未知错误 |

## 流式文本 Hook (use-streaming-text.ts)

### 使用方式

```typescript
import { useStreamingText } from '@/lib/hooks/use-streaming-text';

function StreamingDemo() {
  const { displayedText, isStreaming, skip, reset } = useStreamingText({
    text: '这是一段需要逐字显示的长文本...',
    speed: 30,  // 每秒 30 个字符
    enabled: true,
    onComplete: () => console.log('显示完成'),
  });

  return (
    <div>
      <p>{displayedText}</p>
      {isStreaming && (
        <>
          <button onClick={skip}>跳过</button>
          <button onClick={reset}>重置</button>
        </>
      )}
    </div>
  );
}
```

### 特点

- **逐字显示**: 基于时间控制的字符流效果
- **性能优化**: 使用 requestAnimationFrame
- **跳过功能**: 可立即显示完整文本
- **长度限制**: 超过 500 字符自动禁用流式效果

## 国际化 Hook (use-i18n.tsx)

### 使用方式

```typescript
// 1. 在应用根组件包裹 Provider
import { I18nProvider } from '@/lib/hooks/use-i18n';

function App({ children }) {
  return <I18nProvider>{children}</I18nProvider>;
}

// 2. 在组件中使用
import { useI18n } from '@/lib/hooks/use-i18n';

function MyComponent() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div>
      <p>{t('welcome')}</p>
      <button onClick={() => setLocale('zh-CN')}>中文</button>
      <button onClick={() => setLocale('en-US')}>English</button>
      <p>当前语言: {locale}</p>
    </div>
  );
}
```

### 支持的语言

| 语言代码 | 语言 |
|----------|------|
| `zh-CN` | 简体中文 (默认) |
| `en-US` | 英语 |

### 特点

- **自动检测**: 首次访问自动检测浏览器语言
- **持久化**: 语言偏好保存到 localStorage
- **SSR 安全**: 水合后读取存储值，避免闪烁

## 主题 Hook (use-theme.tsx)

### 使用方式

```typescript
// 1. 包裹 Provider
import { ThemeProvider } from '@/lib/hooks/use-theme';

function App({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// 2. 使用 Hook
import { useTheme } from '@/lib/hooks/use-theme';

function MyComponent() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      当前主题: {resolvedTheme}
    </button>
  );
}
```

### 主题选项

- `light`: 浅色模式
- `dark`: 深色模式
- `system`: 跟随系统

## 场景生成 Hook (use-scene-generator.ts)

### 使用方式

```typescript
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';

function GenerateButton() {
  const {
    generateSceneContent,
    generateSceneActions,
    isGenerating,
    progress,
    error,
  } = useSceneGenerator();

  const handleGenerate = async () => {
    // 步骤1: 生成场景内容
    const contentResult = await generateSceneContent({
      outline: sceneOutline,
      allOutlines: allOutlines,
      stageId: currentStageId,
    });

    if (!contentResult.success) return;

    // 步骤2: 生成场景动作（演讲稿）
    const actionsResult = await generateSceneActions({
      outline: sceneOutline,
      content: contentResult.content,
      previousSpeeches: [],
    });

    if (actionsResult.success) {
      console.log('生成的场景:', actionsResult.scene);
    }
  };

  return (
    <button onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? `生成中 ${progress}%` : '生成场景'}
    </button>
  );
}
```

### 生成流程

```
useSceneGenerator
       │
       ├── generateSceneContent()
       │       │
       │       └── POST /api/generate/scene-content
       │               → 返回场景元素 (Slide/Quiz/etc.)
       │
       └── generateSceneActions()
               │
               └── POST /api/generate/scene-actions
                       → 返回动作序列 (Speech, etc.)
```

## 历史快照 Hook (use-history-snapshot.ts)

```typescript
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';

function MyComponent() {
  const { addHistorySnapshot, undo, redo, canUndo, canRedo } = useHistorySnapshot();

  const handleSave = () => {
    addHistorySnapshot();  // 保存当前状态快照
  };

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>撤销</button>
      <button onClick={redo} disabled={!canRedo}>重做</button>
    </div>
  );
}
```

## 元素排序 Hook (use-order-element.ts)

```typescript
import { useOrderElement } from '@/lib/hooks/use-order-element';

function OrderButtons() {
  const {
    moveUpElement,
    moveDownElement,
    moveTopElement,
    moveBottomElement,
  } = useOrderElement();

  return (
    <>
      <button onClick={() => moveTopElement(elementId)}>置顶</button>
      <button onClick={() => moveUpElement(elementId)}>上移一层</button>
      <button onClick={() => moveDownElement(elementId)}>下移一层</button>
      <button onClick={() => moveBottomElement(elementId)}>置底</button>
    </>
  );
}
```

## 草稿缓存 Hook (use-draft-cache.ts)

```typescript
import { useDraftCache } from '@/lib/hooks/use-draft-cache';

function Editor() {
  const { saveDraft, loadDraft, clearDraft, hasDraft } = useDraftCache('my-editor');

  // 自动加载草稿
  useEffect(() => {
    const draft = loadDraft();
    if (draft) setContent(draft);
  }, []);

  // 自动保存草稿
  const handleChange = (newContent: string) => {
    setContent(newContent);
    saveDraft(newContent);
  };

  return (
    <textarea
      value={content}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        lib/hooks/                               │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - React (useState, useEffect, useCallback, etc.)              │
│  - zustand (状态管理)                                          │
│  - lib/store/* (各 Store)                                      │
│  - lib/types/* (类型定义)                                      │
│  - lib/utils/* (工具函数)                                      │
│  - lib/audio/* (音频相关)                                      │
│  - lib/contexts/scene-context.ts (场景上下文)                  │
│                                                                 │
│  被依赖:                                                        │
│  - components/* (所有 UI 组件)                                  │
│  - app/* (页面组件)                                            │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么 TTS/ASR 使用 Web Speech API？

1. **零成本**: 完全免费，无需 API Key
2. **实时性**: 本地处理，无网络延迟
3. **隐私**: 数据不上传到服务器
4. **简单**: 开箱即用，无需配置

### 为什么流式文本使用 requestAnimationFrame？

1. **帧同步**: 与浏览器渲染周期同步
2. **性能**: 比 setInterval 更高效
3. **平滑**: 时间精度更高
4. **暂停友好**: 标签页不可见时自动暂停

### 为什么 i18n 使用 Context 而非 Zustand？

1. **SSR 友好**: Context 更适合服务端渲染
2. **组件树**: 天然支持组件树广播
3. **简单**: 无需额外的 store 定义
4. **标准模式**: React 国际化的常见模式
