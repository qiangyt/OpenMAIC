# 播放引擎模块 (lib/playback/)

> 统一的课堂回放和实时讨论状态机，驱动 Scene.actions[] 的顺序执行

## 概览

本模块实现了 OpenMAIC 的播放控制逻辑，核心是一个状态机来管理：

1. **录播模式** (`playing`/`paused`) - 按顺序执行预生成的动作序列
2. **实时模式** (`live`) - 处理用户中断和多智能体实时讨论
3. **空闲模式** (`idle`) - 等待用户操作

```
                  start()                  pause()
   idle ──────────────────→ playing ──────────────→ paused
     ▲                         ▲                       │
     │                         │  resume()             │
     │                         └───────────────────────┘
     │
     │  handleEndDiscussion()
     │                         confirmDiscussion()
     │                         / handleUserInterrupt()
     │                              │
     │                              ▼         pause()
     └──────────────────────── live ──────────────→ paused
                                 ▲                    │
                                 │ resume / user msg  │
                                 └────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `engine.ts` | `PlaybackEngine` 类 - 核心状态机和动作执行逻辑 |
| `types.ts` | 类型定义 - EngineMode, TriggerEvent, Callbacks 等 |
| `derived-state.ts` | 派生状态计算 - 从原始状态推导 `PlaybackView` |
| `index.ts` | 模块入口，重导出公开 API |

## 状态机详解

### 状态转换图

```
┌─────────┐   start()   ┌─────────┐   pause()   ┌─────────┐
│  idle   │────────────→│ playing │────────────→│ paused  │
└────▲────┘             └────▲────┘             └────┬────┘
     │                       │                       │
     │                       │      resume()         │
     │                       └───────────────────────┘
     │                       │
     │   handleEndDiscussion │  confirmDiscussion()
     │          / stop()     │  / handleUserInterrupt()
     │                       │         │
     │                       ▼         ▼   pause()   ┌─────────┐
     └─────────────────── live ◄────────────────────│ paused  │
                                ◄────────────────────┴────┬────┘
                                 resume() / user message  │
                                                         │
     注: live → paused 会设置 topicState = 'pending'     │
         paused → live (有 pending topic) 会恢复讨论     │
```

### 状态含义

| 状态 | 含义 | 触发条件 |
|------|------|----------|
| `idle` | 空闲，等待用户操作 | 初始状态、stop()、讨论结束 |
| `playing` | 正在播放预录制的动作序列 | start()、continuePlayback() |
| `paused` | 暂停（播放或讨论） | pause() |
| `live` | 实时讨论模式 | confirmDiscussion()、handleUserInterrupt() |

## 核心类: PlaybackEngine

### 构造函数

```typescript
class PlaybackEngine {
  constructor(
    scenes: Scene[],           // 要播放的场景列表
    actionEngine: ActionEngine, // 动作执行引擎
    audioPlayer: AudioPlayer,   // 音频播放器
    callbacks: PlaybackEngineCallbacks = {}
  ) { ... }
}
```

### 公共 API

#### 基本控制

| 方法 | 状态转换 | 描述 |
|------|----------|------|
| `start()` | idle → playing | 从头开始播放 |
| `continuePlayback()` | idle → playing | 从当前位置继续（讨论结束后） |
| `pause()` | playing/live → paused | 暂停播放或讨论 |
| `resume()` | paused → playing/live | 恢复播放或讨论 |
| `stop()` | * → idle | 停止并重置 |

#### 讨论相关

| 方法 | 状态转换 | 描述 |
|------|----------|------|
| `confirmDiscussion()` | playing → live | 用户点击"加入讨论" |
| `skipDiscussion()` | playing (保持) | 用户跳过讨论 |
| `handleUserInterrupt(text)` | playing/paused → live | 用户发送消息打断播放 |
| `handleEndDiscussion()` | live → idle | 讨论结束 |

#### 状态查询

```typescript
getMode(): EngineMode              // 获取当前模式
getSnapshot(): PlaybackSnapshot    // 导出可序列化的快照
restoreFromSnapshot(snapshot)      // 从快照恢复
isExhausted(): boolean             // 是否所有动作已播放完
```

### 快照与持久化

```typescript
interface PlaybackSnapshot {
  sceneIndex: number;           // 当前场景索引
  actionIndex: number;          // 当前动作索引
  consumedDiscussions: string[]; // 已消费的讨论 ID
  sceneId: string;              // 场景标识（用于验证）
}
```

## 动作处理流程

### processNext() 核心循环

```typescript
private async processNext(): Promise<void> {
  if (this.mode !== 'playing') return;

  // 1. 场景边界检测
  if (this.actionIndex === 0) {
    this.actionEngine.clearEffects();
    this.callbacks.onSceneChange?.(scene.id);
  }

  // 2. 获取当前动作
  const current = this.getCurrentAction();
  if (!current) {
    this.setMode('idle');
    this.callbacks.onComplete?.();
    return;
  }

  // 3. 通知进度
  this.callbacks.onProgress?.(this.getSnapshot());

  // 4. 推进游标
  this.actionIndex++;

  // 5. 根据动作类型分发
  switch (action.type) {
    case 'speech': await this.handleSpeech(action); break;
    case 'spotlight':
    case 'laser': this.handleEffect(action); break;
    case 'discussion': this.handleDiscussion(action); break;
    case 'wb_*': await this.actionEngine.execute(action); break;
  }
}
```

### 动作类型处理

#### 1. speech 动作

```typescript
case 'speech': {
  this.callbacks.onSpeechStart?.(action.text);

  // 尝试播放预生成的音频
  const audioStarted = await this.audioPlayer.play(action.audioId, action.audioUrl);

  if (!audioStarted) {
    // 没有预生成音频 → 尝试浏览器原生 TTS
    if (settings.ttsProviderId === 'browser-native-tts') {
      this.playBrowserTTS(action);
    } else {
      // TTS 禁用 → 使用阅读计时器模拟
      this.scheduleReadingTimer(action.text);
    }
  }

  // 音频/TTS 结束后自动调用 processNext()
}
```

**阅读计时器计算**:
```typescript
// CJK 文本: ~150ms/字符
// 非 CJK 文本: ~240ms/单词 (≈250 WPM)
const isCJK = cjkCount > text.length * 0.3;
const readingMs = isCJK
  ? Math.max(2000, text.length * 150)
  : Math.max(2000, wordCount * 240);
```

#### 2. 效果动作 (spotlight/laser)

```typescript
case 'spotlight':
case 'laser': {
  // 即发即忘 - 不阻塞播放
  this.actionEngine.execute(action);
  this.callbacks.onEffectFire?.({
    kind: action.type,
    targetId: action.elementId,
    // ...
  });
  // 立即继续下一个动作
  this.processNext();
}
```

#### 3. discussion 动作

```typescript
case 'discussion': {
  // 已消费的讨论跳过
  if (this.consumedDiscussions.has(action.id)) {
    this.processNext();
    return;
  }

  // 3 秒延迟后显示 ProactiveCard
  this.triggerDelayTimer = setTimeout(() => {
    this.currentTrigger = {
      id: action.id,
      question: action.topic,
      prompt: action.prompt,
      agentId: action.agentId,
    };
    this.callbacks.onProactiveShow?.(this.currentTrigger);
    // 引擎在此暂停 — 用户调用 confirmDiscussion() 或 skipDiscussion()
  }, 3000);
}
```

#### 4. 白板动作

```typescript
case 'wb_open':
case 'wb_draw_text':
case 'wb_draw_shape':
// ... 其他白板动作:
{
  // 同步执行 - 等待完成后再继续
  await this.actionEngine.execute(action);
  if (this.mode === 'playing') {
    this.processNext();
  }
}
```

## 暂停/恢复机制

### 暂停 (pause)

```typescript
pause(): void {
  if (this.mode === 'playing') {
    // 1. 取消待处理的定时器
    if (this.triggerDelayTimer) {
      clearTimeout(this.triggerDelayTimer);
    }

    // 2. 保存阅读计时器剩余时间
    if (this.speechTimer) {
      this.speechTimerRemaining = Math.max(0,
        this.speechTimerRemaining - (Date.now() - this.speechTimerStart)
      );
      clearTimeout(this.speechTimer);
    }

    // 3. 暂停 TTS
    if (this.browserTTSActive) {
      // Firefox 的 speechSynthesis.pause()/resume() 有 bug
      // 使用 cancel + re-speak 模式
      this.browserTTSPausedChunks = this.browserTTSChunks.slice(this.browserTTSChunkIndex);
      window.speechSynthesis.cancel();
    } else if (this.audioPlayer.isPlaying()) {
      this.audioPlayer.pause();
    }

    this.setMode('paused');
  } else if (this.mode === 'live') {
    this.setMode('paused');
    this.currentTopicState = 'pending';  // 标记讨论待恢复
  }
}
```

### 恢复 (resume)

```typescript
resume(): void {
  if (this.currentTopicState === 'pending') {
    // 恢复讨论
    this.currentTopicState = 'active';
    this.setMode('live');
  } else if (this.browserTTSPausedChunks.length > 0) {
    // 恢复浏览器 TTS (re-speak 剩余块)
    this.browserTTSChunks = this.browserTTSPausedChunks;
    this.browserTTSChunkIndex = 0;
    this.browserTTSPausedChunks = [];
    this.playBrowserTTSChunk();
  } else if (this.audioPlayer.hasActiveAudio()) {
    // 恢复音频播放
    this.audioPlayer.resume();
  } else if (this.speechTimerRemaining > 0) {
    // 恢复阅读计时器
    this.speechTimer = setTimeout(() => {
      this.callbacks.onSpeechEnd?.();
      if (this.mode === 'playing') this.processNext();
    }, this.speechTimerRemaining);
  } else {
    // 其他情况直接继续
    this.processNext();
  }
}
```

## 浏览器原生 TTS

### 分块播放策略

Chrome 有一个 bug：超过 ~15 秒的语音会被静默截断，`onend` 永远不会触发。解决方案是将文本分成句子级别的块：

```typescript
private splitIntoChunks(text: string): string[] {
  // 按句末标点（拉丁 + CJK）和换行符分割
  return text
    .split(/(?<=[.!?。！？\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

private async playBrowserTTSChunk(): Promise<void> {
  if (this.browserTTSChunkIndex >= this.browserTTSChunks.length) {
    // 所有块播放完成
    this.browserTTSActive = false;
    this.callbacks.onSpeechEnd?.();
    if (this.mode === 'playing') this.processNext();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(
    this.browserTTSChunks[this.browserTTSChunkIndex]
  );

  // 应用设置
  utterance.rate = settings.ttsSpeed * speed;
  utterance.volume = settings.ttsMuted ? 0 : settings.ttsVolume;

  // 自动检测语言
  const cjkRatio = cjkCount / text.length;
  utterance.lang = cjkRatio > 0.3 ? 'zh-CN' : 'en-US';

  utterance.onend = () => {
    this.browserTTSChunkIndex++;
    if (this.mode === 'playing') {
      this.playBrowserTTSChunk();  // 播放下一块
    }
  };

  utterance.onerror = (event) => {
    if (event.error !== 'canceled') {
      this.browserTTSChunkIndex++;
      if (this.mode === 'playing') {
        this.playBrowserTTSChunk();
      }
    }
  };

  window.speechSynthesis.speak(utterance);
}
```

### Firefox 兼容性

Firefox 的 `speechSynthesis.pause()`/`resume()` 有 bug，因此采用 **cancel + re-speak** 模式：

```typescript
// 暂停时保存剩余块
this.browserTTSPausedChunks = this.browserTTSChunks.slice(this.browserTTSChunkIndex);
window.speechSynthesis.cancel();

// 恢复时从头播放剩余块
this.browserTTSChunks = this.browserTTSPausedChunks;
this.browserTTSChunkIndex = 0;
this.playBrowserTTSChunk();
```

## 用户中断处理

```typescript
handleUserInterrupt(text: string): void {
  if (this.mode === 'playing' || this.mode === 'paused') {
    // 保存播放位置（减 1 因为 actionIndex 已经递增）
    if (this.savedSceneIndex === null) {
      this.savedSceneIndex = this.sceneIndex;
      this.savedActionIndex = Math.max(0, this.actionIndex - 1);
    }

    // 取消待处理的触发延迟
    if (this.triggerDelayTimer) {
      clearTimeout(this.triggerDelayTimer);
    }
  }

  // 关键：先设置模式，再停止音频
  // speechSynthesis.cancel() 可能同步触发 onend 回调
  // 设置模式可以防止 processNext 意外推进
  this.currentTopicState = 'active';
  this.setMode('live');
  this.audioPlayer.stop();
  this.cancelBrowserTTS();

  this.callbacks.onUserInterrupt?.(text);
}
```

## 讨论生命周期

### 主动讨论 (Proactive Discussion)

由预录制的 `discussion` 动作触发：

```
playing → [discussion action]
            ↓ (3s delay)
          [ProactiveCard 显示]
            ↓
    ┌───────┴───────┐
    ↓               ↓
confirmDiscussion()  skipDiscussion()
    ↓               ↓
    live          consumed → processNext()
    ↓
[实时讨论]
    ↓
handleEndDiscussion()
    ↓
    idle (用户点击"继续播放" → continuePlayback)
```

### 用户中断讨论

由用户在播放中发送消息触发：

```
playing/paused
    ↓
handleUserInterrupt(text)
    ↓
    live
    ↓
[实时讨论]
    ↓
handleEndDiscussion()
    ↓
    idle
```

## 回调接口

```typescript
interface PlaybackEngineCallbacks {
  // 模式变化
  onModeChange?: (mode: EngineMode) => void;

  // 场景/语音
  onSceneChange?: (sceneId: string) => void;
  onSpeechStart?: (text: string) => void;
  onSpeechEnd?: () => void;
  onSpeakerChange?: (role: string) => void;

  // 视觉效果
  onEffectFire?: (effect: Effect) => void;

  // 主动讨论
  onProactiveShow?: (trigger: TriggerEvent) => void;
  onProactiveHide?: () => void;

  // 讨论生命周期
  onDiscussionConfirmed?: (topic: string, prompt?: string, agentId?: string) => void;
  onDiscussionEnd?: () => void;
  onUserInterrupt?: (text: string) => void;

  // 进度追踪
  onProgress?: (snapshot: PlaybackSnapshot) => void;
  onComplete?: () => void;

  // 查询函数
  isAgentSelected?: (agentId: string) => boolean;
  getPlaybackSpeed?: () => number;
}
```

## 派生状态 (derived-state.ts)

### PlaybackView

从多个原始状态变量推导出单一、一致的视图：

```typescript
interface PlaybackView {
  phase: PlaybackPhase;        // 高层阶段
  sourceText: string;          // 气泡显示的文本
  bubbleRole: 'teacher' | 'agent' | 'user' | null;  // 气泡所有者
  activeRole: 'teacher' | 'agent' | 'user' | null;  // 高亮的头像
  buttonState: BubbleButtonState;  // 气泡按钮状态
  isInLiveFlow: boolean;       // 是否在实时 SSE 流中
  isTopicActive: boolean;      // 是否有主题活动（阻止场景切换）
}
```

### 阶段 (PlaybackPhase)

```typescript
type PlaybackPhase =
  | 'idle'              // 空闲
  | 'lecturePlaying'    // 播放讲座
  | 'lecturePaused'     // 讲座暂停
  | 'waitingProactive'  // 等待用户响应主动讨论
  | 'discussionActive'  // 实时讨论中
  | 'discussionPaused'  // 讨论暂停
  | 'cueUser'           // 邀请用户发言
  | 'completed';        // 播放完成
```

### 计算逻辑

```typescript
function computePlaybackView(raw: PlaybackRawState): PlaybackView {
  // 1. 判断是否在实时流中
  const isInLiveFlow = !!(speakingAgentId || thinkingState || chatIsStreaming || sessionType);

  // 2. 确定阶段（优先级顺序很重要！）
  if (isCueUser) phase = 'cueUser';
  else if (isTopicPending) phase = 'discussionPaused';
  else if (speakingAgentId || ...) phase = 'discussionActive';
  else if (discussionTrigger) phase = 'waitingProactive';
  else if (playbackCompleted) phase = 'completed';
  else if (engineMode === 'playing') phase = 'lecturePlaying';
  else if (engineMode === 'paused') phase = 'lecturePaused';
  else phase = 'idle';

  // 3. 确定源文本
  if (liveSpeech) sourceText = liveSpeech;
  else if (isInLiveFlow) sourceText = '';  // 加载中
  else if (lectureSpeech) sourceText = lectureSpeech;
  else sourceText = idleText || '';

  // 4. 确定 bubbleRole / activeRole / buttonState
  // ... (详见源代码)
}
```

## 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                      lib/playback/                              │
├─────────────────────────────────────────────────────────────────┤
│  依赖:                                                          │
│  - lib/types/stage.ts (Scene)                                  │
│  - lib/types/action.ts (Action, SpeechAction, DiscussionAction)│
│  - lib/action/engine.ts (ActionEngine)                         │
│  - lib/utils/audio-player.ts (AudioPlayer)                     │
│  - lib/store/canvas.ts (useCanvasStore)                        │
│  - lib/store/settings.ts (useSettingsStore)                    │
│                                                                 │
│  被依赖:                                                        │
│  - components/stage.tsx (主舞台组件)                            │
│  - components/roundtable/ (圆桌讨论组件)                        │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策

### 为什么使用状态机？

1. **清晰的状态转换**：所有可能的转换都在代码中明确定义
2. **防止非法转换**：如 `idle → paused` 会被拒绝
3. **易于调试**：当前状态和转换都有日志

### 为什么 discussion 动作有 3 秒延迟？

1. **自然过渡**：让前一个 speech 动作自然结束
2. **用户体验**：避免在语音播放中途弹出卡片
3. **可取消**：用户可以在延迟期间暂停/停止

### 为什么使用 cancel + re-speak 而非 pause/resume？

1. **Firefox bug**：`speechSynthesis.pause()`/`resume()` 在 Firefox 上不可靠
2. **一致性**：所有浏览器使用相同的行为
3. **简单**：不需要处理复杂的暂停状态

### 为什么 live 模式是独立的？

1. **不同的数据流**：live 模式由 SSE 流驱动，而非预录制动作
2. **中断处理**：需要保存和恢复播放位置
3. **状态隔离**：避免 live 状态污染 playback 状态
