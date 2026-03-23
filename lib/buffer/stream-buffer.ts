import type { DirectorState } from '@/lib/types/chat';

/**
 * StreamBuffer — 统一的展示节奏控制层。
 *
 * 位于数据源（SSE 流 / PlaybackEngine）和 React 状态之间。
 * 事件被推入有序队列；固定频率的 tick 循环以逐字符方式揭示文本，
 * 并触发类型化回调，使聊天区域和圆桌气泡消费相同节奏的内容。
 *
 * 关键不变量：
 *   - 唯一的节奏来源（此 tick 循环）— 不会出现双重打字机效果。
 *   - pause() 是 O(1) 即时操作 — tick 立即返回。
 *   - 动作仅在 tick 光标到达时触发（在前面的文本之后）。
 *   - 圆桌仅看到当前语音片段（在动作/智能体切换时重置）。
 */

// ─── 缓冲区项类型 ───────────────────────────────────────────────

export interface AgentStartItem {
  kind: 'agent_start';
  messageId: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  color?: string;
}

export interface AgentEndItem {
  kind: 'agent_end';
  messageId: string;
  agentId: string;
}

export interface TextItem {
  kind: 'text';
  messageId: string;
  agentId: string;
  /** 此文本部分的唯一 ID — 区分一条消息中的多个文本项（如讲座）。 */
  partId: string;
  /** 可增长的 — SSE 增量追加到这里。 */
  text: string;
  /** 为 true 时，不会再追加文本。完全揭示后 tick 可以继续前进。 */
  sealed: boolean;
}

export interface ActionItem {
  kind: 'action';
  messageId: string;
  actionId: string;
  actionName: string;
  params: Record<string, unknown>;
  agentId: string;
}

export interface ThinkingItem {
  kind: 'thinking';
  stage: string;
  agentId?: string;
}

export interface CueUserItem {
  kind: 'cue_user';
  fromAgentId?: string;
  prompt?: string;
}

export interface DoneItem {
  kind: 'done';
  totalActions: number;
  totalAgents: number;
  agentHadContent?: boolean;
  directorState?: DirectorState;
}

export interface ErrorItem {
  kind: 'error';
  message: string;
}

export type BufferItem =
  | AgentStartItem
  | AgentEndItem
  | TextItem
  | ActionItem
  | ThinkingItem
  | CueUserItem
  | DoneItem
  | ErrorItem;

// ─── 回调 ───────────────────────────────────────────────────────

export interface StreamBufferCallbacks {
  onAgentStart(data: AgentStartItem): void;
  onAgentEnd(data: AgentEndItem): void;
  /**
   * 在文本项揭示期间每个 tick 触发。
   * @param messageId  — 要更新的消息 ID
   * @param partId     — 此文本部分的唯一 ID（跨 tick 稳定）
   * @param revealedText — 目前可见的文本（完整文本的切片）
   * @param isComplete — 当此文本项完全揭示且已封印时为 true
   */
  onTextReveal(messageId: string, partId: string, revealedText: string, isComplete: boolean): void;
  /** 当 tick 到达动作项时触发。调用者应执行效果并添加徽章。 */
  onActionReady(messageId: string, data: ActionItem): void;
  /**
   * 圆桌气泡的统一语音流。
   * 仅报告当前片段文本（在动作/智能体切换时重置）。
   * 缓冲区完成或销毁时以 (null, null) 调用。
   */
  onLiveSpeech(text: string | null, agentId: string | null): void;
  /**
   * 圆桌气泡自动滚动的语音进度比例。
   * 文本揭示期间每个 tick 触发：ratio = charCursor / totalTextLength。
   * 缓冲区完成或销毁时以 null 调用。
   */
  onSpeechProgress(ratio: number | null): void;
  onThinking(data: { stage: string; agentId?: string } | null): void;
  onCueUser(fromAgentId?: string, prompt?: string): void;
  onDone(data: {
    totalActions: number;
    totalAgents: number;
    agentHadContent?: boolean;
    directorState?: DirectorState;
  }): void;
  onError(message: string): void;
}

// ─── 选项 ─────────────────────────────────────────────────────────

export interface StreamBufferOptions {
  /** tick 之间的毫秒数。默认值：30 */
  tickMs?: number;
  /** 每个 tick 揭示的字符数。默认值：1（≈33 字符/秒） */
  charsPerTick?: number;
  /**
   * 文本片段完全揭示后、前进到下一项之前的固定延迟（毫秒）。
   * 给读者在每个语音块后一个喘息的停顿。默认值：0（无延迟）。
   */
  postTextDelayMs?: number;
  /**
   * 触发动作回调后、前进到下一项之前的延迟（毫秒）。
   * 给动作动画播放的时间。默认值：0。
   */
  actionDelayMs?: number;
}

// ─── StreamBuffer 类 ──────────────────────────────────────────────

export class StreamBuffer {
  // 队列
  private items: BufferItem[] = [];
  private readIndex = 0;
  private charCursor = 0;

  // 圆桌片段追踪
  private currentSegmentText = '';
  private currentAgentId: string | null = null;

  // 控制
  private _paused = false;
  private _disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  // 驻留/延迟计数器（以 tick 为单位）
  private _dwellTicksRemaining = 0;

  // 配置
  private readonly tickMs: number;
  private readonly charsPerTick: number;
  private readonly postTextDelayTicks: number;
  private readonly actionDelayTicks: number;
  private readonly cb: StreamBufferCallbacks;
  private partCounter = 0;
  private _drainResolve: (() => void) | null = null;
  private _drainReject: ((err: Error) => void) | null = null;

  constructor(callbacks: StreamBufferCallbacks, options?: StreamBufferOptions) {
    this.cb = callbacks;
    this.tickMs = options?.tickMs ?? 30;
    this.charsPerTick = options?.charsPerTick ?? 1;
    this.postTextDelayTicks = Math.ceil((options?.postTextDelayMs ?? 0) / this.tickMs);
    this.actionDelayTicks = Math.ceil((options?.actionDelayMs ?? 0) / this.tickMs);
  }

  // ─── 推送方法 ────────────────────────────────────────────────

  pushAgentStart(data: Omit<AgentStartItem, 'kind'>): void {
    if (this._disposed) return;
    this.sealLastText();
    this.items.push({ kind: 'agent_start', ...data });
  }

  pushAgentEnd(data: Omit<AgentEndItem, 'kind'>): void {
    if (this._disposed) return;
    this.sealLastText();
    this.items.push({ kind: 'agent_end', ...data });
  }

  /**
   * 为消息追加文本。
   * 如果队列最后一项是同一 messageId 的未封印文本项，
   * 则增量会原地追加。否则创建新的文本项。
   */
  pushText(messageId: string, delta: string, agentId?: string): void {
    if (this._disposed) return;
    const last = this.items[this.items.length - 1];
    if (last && last.kind === 'text' && last.messageId === messageId && !last.sealed) {
      last.text += delta;
    } else {
      this.items.push({
        kind: 'text',
        messageId,
        agentId: agentId ?? this.currentAgentId ?? '',
        partId: `p${this.partCounter++}`,
        text: delta,
        sealed: false,
      });
    }
  }

  /** 将当前（最后）文本项标记为完成 — 不再预期追加。 */
  sealText(messageId: string): void {
    if (this._disposed) return;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.kind === 'text' && item.messageId === messageId && !item.sealed) {
        item.sealed = true;
        break;
      }
    }
  }

  pushAction(data: Omit<ActionItem, 'kind'>): void {
    if (this._disposed) return;
    this.sealLastText();
    this.items.push({ kind: 'action', ...data });
  }

  pushThinking(data: { stage: string; agentId?: string }): void {
    if (this._disposed) return;
    this.items.push({ kind: 'thinking', ...data });
  }

  pushCueUser(data: { fromAgentId?: string; prompt?: string }): void {
    if (this._disposed) return;
    this.items.push({ kind: 'cue_user', ...data });
  }

  pushDone(data: {
    totalActions: number;
    totalAgents: number;
    agentHadContent?: boolean;
    directorState?: DirectorState;
  }): void {
    if (this._disposed) return;
    this.sealLastText();
    this.items.push({ kind: 'done', ...data });
  }

  pushError(message: string): void {
    if (this._disposed) return;
    this.items.push({ kind: 'error', message });
  }

  // ─── 控制 ─────────────────────────────────────────────────────

  /** 启动 tick 循环。幂等 — 调用两次是安全的。 */
  start(): void {
    if (this._disposed || this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  /** 立即暂停 — tick 变为空操作。 */
  pause(): void {
    this._paused = true;
  }

  /** 从离开的位置精确恢复。 */
  resume(): void {
    this._paused = false;
  }

  /**
   * 返回一个 Promise，在缓冲区处理完所有项（包括最后的 `done` 项）后 resolve。
   * 如果缓冲区在排空前被 dispose/shutdown 则 reject。
   */
  waitUntilDrained(): Promise<void> {
    if (this._disposed) {
      return Promise.reject(new Error('Buffer already disposed'));
    }
    return new Promise<void>((resolve, reject) => {
      this._drainResolve = resolve;
      this._drainReject = reject;
    });
  }

  get paused(): boolean {
    return this._paused;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * 刷新：立即揭示所有剩余内容。
   * 用于恢复持久化会话或强制完成。
   */
  flush(): void {
    if (this._disposed) return;
    while (this.readIndex < this.items.length) {
      const item = this.items[this.readIndex];
      switch (item.kind) {
        case 'text':
          this.cb.onTextReveal(item.messageId, item.partId, item.text, true);
          this.currentSegmentText = item.text;
          this.cb.onLiveSpeech(this.currentSegmentText, this.currentAgentId);
          this.cb.onSpeechProgress(1);
          break;
        case 'action':
          this.currentSegmentText = '';
          this.cb.onActionReady(item.messageId, item);
          this.cb.onLiveSpeech(null, this.currentAgentId);
          break;
        case 'agent_start':
          this.currentAgentId = item.agentId;
          this.currentSegmentText = '';
          this.cb.onThinking(null); // 智能体已选中 — 清除思考指示器
          this.cb.onAgentStart(item);
          this.cb.onLiveSpeech(null, item.agentId);
          break;
        case 'agent_end':
          this.cb.onAgentEnd(item);
          break;
        case 'thinking':
          this.cb.onThinking(item);
          break;
        case 'cue_user':
          this.cb.onCueUser(item.fromAgentId, item.prompt);
          break;
        case 'done':
          this.cb.onLiveSpeech(null, null);
          this.cb.onSpeechProgress(null);
          this.cb.onThinking(null);
          this.cb.onDone(item);
          // resolve 排空 promise
          this._drainResolve?.();
          this._drainResolve = null;
          this._drainReject = null;
          break;
        case 'error':
          this.cb.onError(item.message);
          break;
      }
      this.readIndex++;
      this.charCursor = 0;
    }
  }

  /** 停止 tick 循环，释放资源。此后不再有回调。 */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // reject 等待中的排空 promise
    this._drainReject?.(new Error('Buffer disposed'));
    this._drainResolve = null;
    this._drainReject = null;
    // 最终清理信号
    this.cb.onLiveSpeech(null, null);
    this.cb.onSpeechProgress(null);
  }

  /**
   * 停止 tick 计时器并标记已销毁，但不触发最终的 onLiveSpeech。
   * 用于替换缓冲区（如软暂停后恢复）时，避免 dispose 回调
   * 通过过期的微任务清除圆桌状态。
   */
  shutdown(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // reject 等待中的排空 promise
    this._drainReject?.(new Error('Buffer shutdown'));
    this._drainResolve = null;
    this._drainReject = null;
  }

  // ─── 内部方法 ───────────────────────────────────────────────────

  /** 封印队列中最后的文本项（如果有的话）。 */
  private sealLastText(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.kind === 'text' && !item.sealed) {
        item.sealed = true;
        break;
      }
      // 一旦遇到非文本项就停止搜索
      if (item.kind !== 'text') break;
    }
  }

  private tick(): void {
    if (this._paused || this._disposed) return;

    // 在前进前遵守驻留/动作延迟倒计时
    if (this._dwellTicksRemaining > 0) {
      this._dwellTicksRemaining--;
      return;
    }

    const item = this.items[this.readIndex];
    if (!item) return; // 队列为空或已追上 — 等待

    switch (item.kind) {
      case 'text': {
        // 前进字符光标
        this.charCursor = Math.min(this.charCursor + this.charsPerTick, item.text.length);
        const revealed = item.text.slice(0, this.charCursor);
        const fullyRevealed = this.charCursor >= item.text.length;
        const isComplete = fullyRevealed && item.sealed;

        // 更新聊天区域
        this.cb.onTextReveal(item.messageId, item.partId, revealed, isComplete);

        // 更新圆桌（仅当前片段）。
        // 使用 this.currentAgentId（tick 处理 agent_start 时设置）而非
        // item.agentId — 推送时的竞态意味着当 SSE 推送速度超过 tick 循环时，
        // item.agentId 可能携带前一个智能体的过期值。
        this.currentSegmentText = revealed;
        this.cb.onLiveSpeech(this.currentSegmentText, this.currentAgentId);
        this.cb.onSpeechProgress(item.text.length > 0 ? this.charCursor / item.text.length : 1);

        // 如果完全揭示且已封印则前进到下一项
        if (isComplete) {
          this.readIndex++;
          this.charCursor = 0;

          // 文本结束后的固定暂停 — 给读者在下一个动作或智能体轮次
          // 触发前的喘息间隙。
          if (this.postTextDelayTicks > 0) {
            this._dwellTicksRemaining = this.postTextDelayTicks;
            return; // 下一个 tick 将倒计时，然后 advanceNonText
          }

          // 在同一个 tick 中处理任何可立即前进的项
          // （例如文本后的动作徽章）
          this.advanceNonText();
        }
        // 如果 fullyRevealed 但 !sealed：等待更多 SSE 增量
        break;
      }

      // 非文本项立即处理
      case 'agent_start':
        this.currentAgentId = item.agentId;
        this.currentSegmentText = '';
        this.cb.onThinking(null); // 智能体已选中 — 清除思考指示器
        this.cb.onAgentStart(item);
        this.cb.onLiveSpeech(null, item.agentId);
        this.readIndex++;
        this.charCursor = 0;
        this.advanceNonText();
        break;

      case 'agent_end':
        this.cb.onAgentEnd(item);
        this.readIndex++;
        this.charCursor = 0;
        this.advanceNonText();
        break;

      case 'action':
        this.currentSegmentText = '';
        this.cb.onActionReady(item.messageId, item);
        this.cb.onLiveSpeech(null, this.currentAgentId);
        this.readIndex++;
        this.charCursor = 0;
        // 动作后延迟以便动画播放
        if (this.actionDelayTicks > 0) {
          this._dwellTicksRemaining = this.actionDelayTicks;
          return;
        }
        this.advanceNonText();
        break;

      case 'thinking':
        this.cb.onThinking(item);
        this.readIndex++;
        this.charCursor = 0;
        this.advanceNonText();
        break;

      case 'cue_user':
        this.cb.onCueUser(item.fromAgentId, item.prompt);
        this.readIndex++;
        this.charCursor = 0;
        this.advanceNonText();
        break;

      case 'done':
        this.cb.onLiveSpeech(null, null);
        this.cb.onSpeechProgress(null);
        this.cb.onThinking(null);
        this.cb.onDone(item);
        this.readIndex++;
        this.charCursor = 0;
        // 停止计时器 — 无更多内容需处理
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        // resolve 排空 promise
        this._drainResolve?.();
        this._drainResolve = null;
        this._drainReject = null;
        break;

      case 'error':
        this.cb.onError(item.message);
        this.readIndex++;
        this.charCursor = 0;
        this.advanceNonText();
        break;
    }
  }

  /**
   * 处理非文本项后，继续在同一个 tick 中前进连续的非文本项。
   * 遇到文本项或队列末尾时停止 — 下一个 tick 将处理文本项
   * （这样我们不会跳过逐字符揭示）。
   *
   * 当动作触发延迟时也会停止，以便其动画播放。
   */
  private advanceNonText(): void {
    while (this.readIndex < this.items.length) {
      const next = this.items[this.readIndex];
      if (next.kind === 'text') break; // 让下一个 tick 处理文本

      switch (next.kind) {
        case 'agent_start':
          this.currentAgentId = next.agentId;
          this.currentSegmentText = '';
          this.cb.onThinking(null); // 智能体已选中 — 清除思考指示器
          this.cb.onAgentStart(next);
          this.cb.onLiveSpeech(null, next.agentId);
          break;
        case 'agent_end':
          this.cb.onAgentEnd(next);
          break;
        case 'action':
          this.currentSegmentText = '';
          this.cb.onActionReady(next.messageId, next);
          this.cb.onLiveSpeech(null, this.currentAgentId);
          this.readIndex++;
          this.charCursor = 0;
          // 动作后暂停以便动画播放
          if (this.actionDelayTicks > 0) {
            this._dwellTicksRemaining = this.actionDelayTicks;
            return; // 倒计时后在下一个 tick 恢复
          }
          continue; // 无延迟 — 继续前进
        case 'thinking':
          this.cb.onThinking(next);
          break;
        case 'cue_user':
          this.cb.onCueUser(next.fromAgentId, next.prompt);
          break;
        case 'done':
          this.cb.onLiveSpeech(null, null);
          this.cb.onSpeechProgress(null);
          this.cb.onThinking(null);
          this.cb.onDone(next);
          this.readIndex++;
          this.charCursor = 0;
          if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
          }
          // resolve 排空 promise
          this._drainResolve?.();
          this._drainResolve = null;
          this._drainReject = null;
          return; // 完成 — 停止前进
        case 'error':
          this.cb.onError(next.message);
          break;
      }
      this.readIndex++;
      this.charCursor = 0;
    }
  }
}
