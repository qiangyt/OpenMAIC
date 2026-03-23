/**
 * 播放引擎 - 用于讲稿播放和实时讨论的统一状态机
 *
 * 通过 ActionEngine 直接消费 Scene.actions[]。
 * 无需中间编译步骤 — 动作原样执行。
 *
 * 状态机:
 *
 *                  start()                  pause()
 *   idle ──────────────────→ playing ──────────────→ paused
 *     ▲                         ▲                       │
 *     │                         │  resume()             │
 *     │                         └───────────────────────┘
 *     │
 *     │  handleEndDiscussion()
 *     │                         confirmDiscussion()
 *     │                         / handleUserInterrupt()
 *     │                              │
 *     │                              ▼         pause()
 *     └──────────────────────── live ──────────────→ paused
 *                                 ▲                    │
 *                                 │ resume / user msg  │
 *                                 └────────────────────┘
 */

import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction, DiscussionAction } from '@/lib/types/action';
import type {
  EngineMode,
  TopicState,
  PlaybackEngineCallbacks,
  PlaybackSnapshot,
  TriggerEvent,
  Effect,
} from './types';
import type { AudioPlayer } from '@/lib/utils/audio-player';
import { ActionEngine } from '@/lib/action/engine';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { createLogger } from '@/lib/logger';

const log = createLogger('PlaybackEngine');

/**
 * 如果超过 30% 的字符是 CJK 字符，则将文本视为中文。
 * 故意设置得较低：混合中文文本通常包含标点符号、数字和简短的
 * 拉丁字母片段（例如 "AI课堂"）。
 */
const CJK_LANG_THRESHOLD = 0.3;

export class PlaybackEngine {
  private scenes: Scene[] = [];
  private sceneIndex: number = 0;
  private actionIndex: number = 0;
  private mode: EngineMode = 'idle';
  private consumedDiscussions: Set<string> = new Set();

  // 讨论状态保存
  private savedSceneIndex: number | null = null;
  private savedActionIndex: number | null = null;

  // 讨论主题状态
  private currentTopicState: TopicState | null = null;

  // 依赖项
  private audioPlayer: AudioPlayer;
  private actionEngine: ActionEngine;
  private callbacks: PlaybackEngineCallbacks;

  // 场景标识（用于快照验证）
  private sceneId: string | undefined;

  // 内部状态
  private currentTrigger: TriggerEvent | null = null;
  private triggerDelayTimer: ReturnType<typeof setTimeout> | null = null;
  // 用于无预生成音频的语音动作的阅读时间计时器（TTS 已禁用）
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private speechTimerStart: number = 0; // 计时器调度时的 Date.now()
  // 浏览器原生 TTS 状态（Web Speech API）
  private browserTTSActive: boolean = false;
  private browserTTSChunks: string[] = []; // 句子级别的分块，用于顺序播放
  private browserTTSChunkIndex: number = 0; // 当前正在朗读的分块
  private browserTTSPausedChunks: string[] = []; // 暂停时保存的剩余分块（用于取消+重新朗读）
  private speechTimerRemaining: number = 0; // 剩余毫秒数（暂停时设置）

  constructor(
    scenes: Scene[],
    actionEngine: ActionEngine,
    audioPlayer: AudioPlayer,
    callbacks: PlaybackEngineCallbacks = {},
  ) {
    this.scenes = scenes;
    this.sceneId = scenes[0]?.id;
    this.actionEngine = actionEngine;
    this.audioPlayer = audioPlayer;
    this.callbacks = callbacks;
  }

  // ==================== 公共 API ====================

  /** 获取当前引擎模式 */
  getMode(): EngineMode {
    return this.mode;
  }

  /** 导出可序列化的播放快照 */
  getSnapshot(): PlaybackSnapshot {
    return {
      sceneIndex: this.sceneIndex,
      actionIndex: this.actionIndex,
      consumedDiscussions: [...this.consumedDiscussions],
      sceneId: this.sceneId,
    };
  }

  /** 从快照恢复播放位置 */
  restoreFromSnapshot(snapshot: PlaybackSnapshot): void {
    this.sceneIndex = snapshot.sceneIndex;
    this.actionIndex = snapshot.actionIndex;
    this.consumedDiscussions = new Set(snapshot.consumedDiscussions);
  }

  /** idle → playing（从头开始） */
  start(): void {
    if (this.mode !== 'idle') {
      log.warn('Cannot start: not idle, current mode:', this.mode);
      return;
    }

    this.sceneIndex = 0;
    this.actionIndex = 0;
    this.setMode('playing');
    this.processNext();
  }

  /** idle → playing（从当前位置继续，例如讨论结束后） */
  continuePlayback(): void {
    if (this.mode !== 'idle') {
      log.warn('Cannot continue: not idle, current mode:', this.mode);
      return;
    }
    this.setMode('playing');
    this.processNext();
  }

  /** playing → paused | live → paused（中止 SSE、截断、主题待定） */
  pause(): void {
    if (this.mode === 'playing') {
      // 取消待处理的计时器
      if (this.triggerDelayTimer) {
        clearTimeout(this.triggerDelayTimer);
        this.triggerDelayTimer = null;
      }
      if (this.speechTimer) {
        // 保存剩余时间以便 resume() 重新调度
        this.speechTimerRemaining = Math.max(
          0,
          this.speechTimerRemaining - (Date.now() - this.speechTimerStart),
        );
        clearTimeout(this.speechTimer);
        this.speechTimer = null;
      }
      this.setMode('paused');
      // 冻结 TTS — 但如果正在等待 ProactiveCard 则跳过（没有活动的语音）
      if (!this.currentTrigger) {
        if (this.browserTTSActive) {
          // 取消+重新朗读模式：保存剩余分块以便恢复。
          // speechSynthesis.pause()/resume() 在 Firefox 上有问题，
          // 所以我们现在取消并在恢复时从当前分块开始重新朗读。
          this.browserTTSPausedChunks = this.browserTTSChunks.slice(this.browserTTSChunkIndex);
          window.speechSynthesis?.cancel();
          // 注意：cancel 会触发 onerror('canceled')，我们忽略它（见 playBrowserTTSChunk）
        } else if (this.audioPlayer.isPlaying()) {
          this.audioPlayer.pause();
        }
      }
    } else if (this.mode === 'live') {
      this.setMode('paused');
      this.currentTopicState = 'pending';
      // 调用者负责中止 SSE
    } else {
      log.warn('Cannot pause: mode is', this.mode);
    }
  }

  /** paused → playing（TTS 恢复） | paused（讨论中）→ live */
  resume(): void {
    if (this.mode !== 'paused') {
      log.warn('Cannot resume: not paused, mode is', this.mode);
      return;
    }

    if (this.currentTopicState === 'pending') {
      // 恢复讨论 → live
      this.currentTopicState = 'active';
      this.setMode('live');
    } else if (this.currentTrigger) {
      // 正在等待 ProactiveCard — 只恢复模式，不操作音频
      this.setMode('playing');
    } else {
      // 恢复讲稿
      this.setMode('playing');
      if (this.browserTTSPausedChunks.length > 0) {
        // 浏览器 TTS 通过取消暂停 — 重新朗读剩余分块
        this.browserTTSActive = true;
        this.browserTTSChunks = this.browserTTSPausedChunks;
        this.browserTTSChunkIndex = 0;
        this.browserTTSPausedChunks = [];
        this.playBrowserTTSChunk();
      } else if (this.audioPlayer.hasActiveAudio()) {
        // 音频已暂停 — 恢复它；TTS onend 会调用 processNext
        this.audioPlayer.resume();
      } else if (this.speechTimerRemaining > 0) {
        // 阅读计时器已暂停 — 用剩余时间重新调度
        this.speechTimerStart = Date.now();
        this.speechTimer = setTimeout(() => {
          this.speechTimer = null;
          this.speechTimerRemaining = 0;
          this.callbacks.onSpeechEnd?.();
          if (this.mode === 'playing') this.processNext();
        }, this.speechTimerRemaining);
      } else {
        // TTS 在暂停期间已完成，继续下一个事件
        this.processNext();
      }
    }
  }

  /** → idle */
  stop(): void {
    // 在停止音频之前设置模式，以防止来自同步 onend 回调的
    // 错误 processNext（详见 handleUserInterrupt）。
    this.setMode('idle');
    this.audioPlayer.stop();
    this.cancelBrowserTTS();
    this.actionEngine.clearEffects();
    if (this.triggerDelayTimer) {
      clearTimeout(this.triggerDelayTimer);
      this.triggerDelayTimer = null;
    }
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    this.speechTimerRemaining = 0;
    this.sceneIndex = 0;
    this.actionIndex = 0;
    this.savedSceneIndex = null;
    this.savedActionIndex = null;
    this.currentTopicState = null;
    this.currentTrigger = null;
  }

  /** 用户点击 ProactiveCard 上的"参与" → 保存游标 → live */
  confirmDiscussion(): void {
    if (!this.currentTrigger) {
      log.warn('confirmDiscussion called but no trigger');
      return;
    }

    // 标记为已消费，这样重播时不会再次触发
    this.consumedDiscussions.add(this.currentTrigger.id);

    // 保存讲稿状态 — 保持 actionIndex 不变（已过讨论点）。
    // 讨论放置在所有语音动作之后，所以前面的语音已经完全播放；
    // 无需重播它。
    this.savedSceneIndex = this.sceneIndex;
    this.savedActionIndex = this.actionIndex;

    // 进入实时模式
    this.currentTopicState = 'active';
    this.setMode('live');

    // 通知回调
    this.callbacks.onProactiveHide?.();
    this.callbacks.onDiscussionConfirmed?.(
      this.currentTrigger.question,
      this.currentTrigger.prompt,
      this.currentTrigger.agentId,
    );
    this.currentTrigger = null;
  }

  /** 用户点击 ProactiveCard 上的"跳过" → 已消费 → processNext */
  skipDiscussion(): void {
    if (this.currentTrigger) {
      this.consumedDiscussions.add(this.currentTrigger.id);
      this.currentTrigger = null;
    }
    this.callbacks.onProactiveHide?.();

    if (this.mode === 'playing') {
      this.processNext();
    }
  }

  /** 结束讨论 → 恢复讲稿 → idle（用户点击"开始"继续） */
  handleEndDiscussion(): void {
    this.actionEngine.clearEffects();
    this.currentTopicState = 'closed';

    // 如果讨论期间白板已打开，关闭它
    useCanvasStore.getState().setWhiteboardOpen(false);

    this.callbacks.onDiscussionEnd?.();

    // 恢复讲稿状态
    if (this.savedSceneIndex !== null && this.savedActionIndex !== null) {
      this.sceneIndex = this.savedSceneIndex;
      this.actionIndex = this.savedActionIndex;
      this.savedSceneIndex = null;
      this.savedActionIndex = null;
    }

    this.setMode('idle');
  }

  /** 用户在播放期间发送消息 → 中断 → live 模式 */
  handleUserInterrupt(text: string): void {
    if (this.mode === 'playing' || this.mode === 'paused') {
      // 在停止音频之前保存讲稿状态 — actionIndex 已经由 processNext
      // 递增，所以减 1 以便恢复时重播被中断的句子。
      // 防止覆盖之前保存的位置（例如 live → paused → 新消息）。
      if (this.savedSceneIndex === null) {
        this.savedSceneIndex = this.sceneIndex;
        this.savedActionIndex = Math.max(0, this.actionIndex - 1);
      }

      // 取消待处理的触发延迟
      if (this.triggerDelayTimer) {
        clearTimeout(this.triggerDelayTimer);
        this.triggerDelayTimer = null;
      }
    }

    // 在停止音频之前设置模式 — speechSynthesis.cancel() 可能同步
    // 触发 onend 回调，而 processNext 守卫检查 `this.mode === 'playing'`。
    // 先设置模式可以防止错误的 processNext 将 actionIndex 推进到
    // 被中断语音之后。
    this.currentTopicState = 'active';
    this.setMode('live');
    this.audioPlayer.stop();
    this.cancelBrowserTTS();
    this.callbacks.onUserInterrupt?.(text);
  }

  /** 是否所有剩余动作都已被消费（没有语音可播放） */
  isExhausted(): boolean {
    let si = this.sceneIndex;
    let ai = this.actionIndex;
    while (si < this.scenes.length) {
      const actions = this.scenes[si].actions || [];
      while (ai < actions.length) {
        const action = actions[ai];
        // 已消费的讨论不计入剩余工作
        if (action.type === 'discussion' && this.consumedDiscussions.has(action.id)) {
          ai++;
          continue;
        }
        return false;
      }
      si++;
      ai = 0;
    }
    return true;
  }

  // ==================== 私有方法 ====================

  private setMode(mode: EngineMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.callbacks.onModeChange?.(mode);
  }

  /**
   * 获取当前动作，如果播放完成则返回 null。
   * 当场景的动作耗尽时自动推进 sceneIndex。
   */
  private getCurrentAction(): { action: Action; sceneId: string } | null {
    while (this.sceneIndex < this.scenes.length) {
      const scene = this.scenes[this.sceneIndex];
      const actions = scene.actions || [];

      if (this.actionIndex < actions.length) {
        return { action: actions[this.actionIndex], sceneId: scene.id };
      }

      // 移动到下一个场景
      this.sceneIndex++;
      this.actionIndex = 0;
    }
    return null;
  }

  /**
   * 核心处理循环：消费下一个动作。
   */
  private async processNext(): Promise<void> {
    if (this.mode !== 'playing') return;

    // 检查场景边界（在每个新场景开始时触发场景变更回调）
    if (this.actionIndex === 0 && this.sceneIndex < this.scenes.length) {
      const scene = this.scenes[this.sceneIndex];
      this.actionEngine.clearEffects();
      this.callbacks.onSceneChange?.(scene.id);
      this.callbacks.onSpeakerChange?.('teacher');
    }

    const current = this.getCurrentAction();
    if (!current) {
      // 所有场景完成
      this.actionEngine.clearEffects();
      this.setMode('idle');
      this.callbacks.onComplete?.();
      return;
    }

    const { action } = current;

    // 在推进游标之前通知进度，这样快照指向当前动作。
    // 恢复时将重播同一动作 — 这是语音的期望行为
    // （用户可能只听了一半）。
    this.callbacks.onProgress?.(this.getSnapshot());

    this.actionIndex++;

    switch (action.type) {
      case 'speech': {
        const speechAction = action as SpeechAction;
        this.callbacks.onSpeechStart?.(speechAction.text);

        // onEnded → processNext；如果暂停，resume() 会调用 processNext
        this.audioPlayer.onEnded(() => {
          this.callbacks.onSpeechEnd?.();
          if (this.mode === 'playing') {
            this.processNext();
          }
        });

        // 无预生成音频时的预估阅读时间（TTS 已禁用）。
        // CJK 文本：约 150ms/字符（一个字符约等于一个词）。
        // 非 CJK 文本：约 240ms/词（约 250 WPM）。
        // 最小 2 秒。暂停时取消；resume() 直接调用 processNext。
        const scheduleReadingTimer = () => {
          const text = speechAction.text;
          const cjkCount = (
            text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []
          ).length;
          const isCJK = cjkCount > text.length * 0.3;
          const speed = this.callbacks.getPlaybackSpeed?.() ?? 1;
          const rawMs = isCJK
            ? Math.max(2000, text.length * 150)
            : Math.max(2000, text.split(/\s+/).filter(Boolean).length * 240);
          const readingMs = rawMs / speed;
          this.speechTimerStart = Date.now();
          this.speechTimerRemaining = readingMs;
          this.speechTimer = setTimeout(() => {
            this.speechTimer = null;
            this.speechTimerRemaining = 0;
            this.callbacks.onSpeechEnd?.();
            if (this.mode === 'playing') this.processNext();
          }, readingMs);
        };

        this.audioPlayer
          .play(speechAction.audioId || '', speechAction.audioUrl)
          .then((audioStarted) => {
            if (!audioStarted) {
              // 无预生成音频 — 如果选中了浏览器原生 TTS 则尝试使用
              const settings = useSettingsStore.getState();
              if (
                settings.ttsEnabled &&
                settings.ttsProviderId === 'browser-native-tts' &&
                typeof window !== 'undefined' &&
                window.speechSynthesis
              ) {
                this.playBrowserTTS(speechAction);
              } else {
                scheduleReadingTimer();
              }
            }
          })
          .catch((err) => {
            log.error('TTS error:', err);
            scheduleReadingTimer();
          });
        break;
      }

      case 'spotlight':
      case 'laser': {
        // 通过 ActionEngine 执行即发即弃的视觉效果
        this.actionEngine.execute(action);
        this.callbacks.onEffectFire?.({
          kind: action.type,
          targetId: action.elementId,
          ...(action.type === 'spotlight'
            ? { dimOpacity: action.dimOpacity }
            : { color: action.color }),
        } as Effect);
        // 不阻塞 — 立即继续
        this.processNext();
        break;
      }

      case 'discussion': {
        const discussionAction = action as DiscussionAction;
        // 检查是否已消费
        if (this.consumedDiscussions.has(discussionAction.id)) {
          this.processNext();
          return;
        }
        // 如果讨论的智能体不在用户选择的列表中则跳过
        if (
          discussionAction.agentId &&
          this.callbacks.isAgentSelected &&
          !this.callbacks.isAgentSelected(discussionAction.agentId)
        ) {
          this.consumedDiscussions.add(discussionAction.id);
          this.processNext();
          return;
        }

        // 显示 ProactiveCard 前延迟 3 秒（让前面的语音自然结束）
        const trigger: TriggerEvent = {
          id: discussionAction.id,
          question: discussionAction.topic,
          prompt: discussionAction.prompt,
          agentId: discussionAction.agentId,
        };

        this.triggerDelayTimer = setTimeout(() => {
          this.triggerDelayTimer = null;
          if (this.mode !== 'playing') return; // 如果用户暂停/停止则取消
          this.currentTrigger = trigger;
          this.callbacks.onProactiveShow?.(trigger);
          // 引擎在此暂停 — 用户调用 confirmDiscussion() 或 skipDiscussion()
        }, 3000);
        break;
      }

      case 'play_video':
      case 'wb_open':
      case 'wb_draw_text':
      case 'wb_draw_shape':
      case 'wb_draw_chart':
      case 'wb_draw_latex':
      case 'wb_draw_table':
      case 'wb_clear':
      case 'wb_delete':
      case 'wb_close': {
        // 同步白板动作 — 等待完成后继续
        await this.actionEngine.execute(action);
        if (this.mode === 'playing') {
          this.processNext();
        }
        break;
      }

      default:
        // 未知动作，跳过
        this.processNext();
        break;
    }
  }

  // ==================== 浏览器原生 TTS ====================

  /**
   * 将文本拆分为句子级别的分块以便顺序播放。
   * Chrome 有一个 bug，超过约 15 秒的语音会被静默截断且 onend
   * 永远不会触发，导致引擎挂起。分块可以避免这个问题。
   */
  private splitIntoChunks(text: string): string[] {
    // 按句子结束标点（拉丁 + CJK）和换行符拆分
    const chunks = text
      .split(/(?<=[.!?。！？\n])\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // 如果拆分没有产生任何结果（没有标点），返回原始文本
    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * 使用 Web Speech API（浏览器原生 TTS）播放文本。
   * 将文本拆分为句子级别的分块以避免 Chrome 的约 15 秒截断。
   * 使用取消+重新朗读实现暂停/恢复（Firefox 兼容性）。
   */
  private playBrowserTTS(speechAction: SpeechAction): void {
    this.browserTTSChunks = this.splitIntoChunks(speechAction.text);
    this.browserTTSChunkIndex = 0;
    this.browserTTSPausedChunks = [];
    this.browserTTSActive = true;
    this.playBrowserTTSChunk();
  }

  /** 朗读当前分块；完成后推进到下一个或结束。 */
  private async playBrowserTTSChunk(): Promise<void> {
    if (this.browserTTSChunkIndex >= this.browserTTSChunks.length) {
      // 所有分块完成
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.callbacks.onSpeechEnd?.();
      if (this.mode === 'playing') this.processNext();
      return;
    }

    const settings = useSettingsStore.getState();
    const chunkText = this.browserTTSChunks[this.browserTTSChunkIndex];
    const utterance = new SpeechSynthesisUtterance(chunkText);

    // 应用设置
    const speed = this.callbacks.getPlaybackSpeed?.() ?? 1;
    utterance.rate = (settings.ttsSpeed ?? 1) * speed;
    utterance.volume = settings.ttsMuted ? 0 : (settings.ttsVolume ?? 1);

    // 确保语音已加载（Chrome 异步加载）
    const voices = await this.ensureVoicesLoaded();

    // 设置语音：尝试用户配置的语音，回退到自动检测语言
    let voiceFound = false;
    if (settings.ttsVoice && settings.ttsVoice !== 'default') {
      const voice = voices.find((v) => v.voiceURI === settings.ttsVoice);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
        voiceFound = true;
      }
    }
    if (!voiceFound) {
      // 没有可用的已配置语音 — 检测文本语言以便浏览器
      // 自动选择合适的语音。
      const cjkRatio =
        (chunkText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length / chunkText.length;
      utterance.lang = cjkRatio > CJK_LANG_THRESHOLD ? 'zh-CN' : 'en-US';
    }

    utterance.onend = () => {
      this.browserTTSChunkIndex++;
      if (this.mode === 'playing') {
        this.playBrowserTTSChunk(); // 下一个分块
      }
    };

    utterance.onerror = (event) => {
      // 'canceled' 是调用 stop/pause 时的预期行为 — 不是真正的错误
      if (event.error !== 'canceled') {
        log.warn('Browser TTS chunk error:', event.error);
        // 跳过失败的分块，尝试下一个
        this.browserTTSChunkIndex++;
        if (this.mode === 'playing') {
          this.playBrowserTTSChunk();
        }
      }
      // 对于 'canceled'：什么也不做 — 暂停处理器已保存状态
    };

    // Chrome bug workaround: cancel() before speak() to clear stale synthesis
    // state that can produce garbled/broken audio output.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /**
   * 等待 speechSynthesis 语音加载（Chrome 异步加载）。
   * 缓存结果以便后续调用立即返回。
   */
  private cachedVoices: SpeechSynthesisVoice[] | null = null;
  private async ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.cachedVoices = voices;
      return voices;
    }

    // Chrome：语音异步加载 — 等待 voiceschanged 事件
    await new Promise<void>((resolve) => {
      const onVoicesChanged = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
      // 2 秒后超时以避免挂起
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }, 2000);
    });

    voices = window.speechSynthesis.getVoices();
    this.cachedVoices = voices;
    return voices;
  }

  /** 取消任何活动的浏览器原生 TTS */
  private cancelBrowserTTS(): void {
    if (this.browserTTSActive) {
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      window.speechSynthesis?.cancel();
    }
  }
}
