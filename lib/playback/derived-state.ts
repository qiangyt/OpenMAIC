/**
 * 派生播放状态 - 纯函数，从分散在 Stage 中的约 15 个原始状态变量
 * 计算出高层级的 PlaybackView。
 *
 * 这将所有"当前正在发生什么？"的推导逻辑集中化，使 Stage 和 Roundtable
 * 都能消费单一、一致的视图对象，而不是内联重复推导相同的条件。
 */

import type { EngineMode, TriggerEvent } from './types';

// ---------------------------------------------------------------------------
// 输入：从 Stage 的 useState 变量收集的原始状态
// ---------------------------------------------------------------------------

export interface PlaybackRawState {
  engineMode: EngineMode;
  lectureSpeech: string | null;
  liveSpeech: string | null;
  speakingAgentId: string | null;
  thinkingState: { stage: string; agentId?: string } | null;
  isCueUser: boolean;
  isTopicPending: boolean;
  chatIsStreaming: boolean;
  discussionTrigger: TriggerEvent | null;
  playbackCompleted: boolean;
  idleText: string | null;
  /** 当前发言的智能体是否为学生（非教师）。由调用方提供。 */
  speakingStudent: boolean;
  /** 当前会话类型 — 在智能体循环轮次之间保持设置（仅由 doSessionCleanup 清除）。 */
  sessionType: string | null;
}

// ---------------------------------------------------------------------------
// 输出：由 Roundtable（以及 Stage 用于门控）消费的单一派生视图
// ---------------------------------------------------------------------------

export type PlaybackPhase =
  | 'idle'
  | 'lecturePlaying'
  | 'lecturePaused'
  | 'waitingProactive'
  | 'discussionActive'
  | 'discussionPaused'
  | 'cueUser'
  | 'completed';

export type BubbleButtonState = 'bars' | 'play' | 'restart' | 'none';

export interface PlaybackView {
  /** 高层级阶段 — "当前正在发生什么？" */
  phase: PlaybackPhase;

  /** 在语音气泡中显示的文本（不含 userMessage 覆盖层） */
  sourceText: string;

  /** 谁拥有语音气泡 */
  bubbleRole: 'teacher' | 'agent' | 'user' | null;

  /** 谁正在主动发言（头像高亮） */
  activeRole: 'teacher' | 'agent' | 'user' | null;

  /** 气泡按钮状态 */
  buttonState: BubbleButtonState;

  /** 是否处于实时 SSE 流中（抑制讲稿文本） */
  isInLiveFlow: boolean;

  /** 是否有任何主题相关活动阻止场景切换 */
  isTopicActive: boolean;
}

// ---------------------------------------------------------------------------
// 纯计算
// ---------------------------------------------------------------------------

export function computePlaybackView(raw: PlaybackRawState): PlaybackView {
  const {
    engineMode,
    lectureSpeech,
    liveSpeech,
    speakingAgentId,
    thinkingState,
    isCueUser,
    isTopicPending,
    chatIsStreaming,
    discussionTrigger,
    playbackCompleted,
    idleText,
    speakingStudent,
    sessionType,
  } = raw;

  // ---- isInLiveFlow ----
  // 当存在任何实时 SSE 活动（智能体发言、思考或流式传输）时为真。
  // 包含 chatIsStreaming 以覆盖整个问答会话（智能体响应完成与用户
  // 下一条消息之间的间隙）。
  // 包含 sessionType 以桥接智能体循环轮次之间的间隙：`done` 事件
  // 会清除 chatIsStreaming，但会话在 doSessionCleanup 运行前仍处于
  // 活动状态。若没有这个，bubbleRole 会短暂落入 teacher 的 idleText
  // 分支，导致可见的闪烁。
  const isInLiveFlow = !!(speakingAgentId || thinkingState || chatIsStreaming || sessionType);

  // ---- phase ----
  // 实时流状态必须在 playbackCompleted 之前检查，这样从完成状态
  // 开始问答时不会让重启图标泄漏到智能体气泡中。
  let phase: PlaybackPhase;
  if (isCueUser) {
    phase = 'cueUser';
  } else if (isTopicPending) {
    phase = 'discussionPaused';
  } else if (speakingAgentId || thinkingState || chatIsStreaming || sessionType) {
    phase = 'discussionActive';
  } else if (discussionTrigger) {
    phase = 'waitingProactive';
  } else if (playbackCompleted) {
    phase = 'completed';
  } else if (engineMode === 'playing') {
    phase = 'lecturePlaying';
  } else if (engineMode === 'paused') {
    phase = 'lecturePaused';
  } else {
    phase = 'idle';
  }

  // ---- sourceText（不含 userMessage — Roundtable 在本地覆盖它） ----
  let sourceText: string;
  if (liveSpeech) {
    sourceText = liveSpeech;
  } else if (isInLiveFlow) {
    // 在实时流中但还没有文本 — 显示空（加载点由气泡处理）
    sourceText = '';
  } else if (lectureSpeech) {
    sourceText = lectureSpeech;
  } else if (phase === 'completed') {
    sourceText = '';
  } else {
    sourceText = idleText || '';
  }

  // ---- 气泡加载状态 ----
  const isBubbleLoading = !!(speakingAgentId && !liveSpeech);
  const isAgentLoading = !!(speakingStudent && !liveSpeech);

  // ---- activeRole ----
  let activeRole: 'teacher' | 'agent' | 'user' | null;
  if (liveSpeech && speakingStudent) {
    activeRole = 'agent';
  } else if (liveSpeech) {
    activeRole = 'teacher';
  } else if (isAgentLoading) {
    activeRole = 'agent';
  } else if (isBubbleLoading) {
    activeRole = 'teacher';
  } else if (isCueUser) {
    activeRole = null;
  } else if (lectureSpeech) {
    activeRole = 'teacher';
  } else {
    activeRole = null;
  }

  // ---- bubbleRole ----
  let bubbleRole: 'teacher' | 'agent' | 'user' | null;
  if (liveSpeech && speakingStudent) {
    bubbleRole = 'agent';
  } else if (liveSpeech) {
    bubbleRole = 'teacher';
  } else if (isAgentLoading) {
    bubbleRole = 'agent';
  } else if (isBubbleLoading) {
    bubbleRole = 'teacher';
  } else if (isInLiveFlow) {
    bubbleRole = null;
  } else if (isCueUser) {
    bubbleRole = null;
  } else if (lectureSpeech || idleText) {
    bubbleRole = 'teacher';
  } else {
    bubbleRole = null;
  }

  // ---- buttonState ----
  let buttonState: BubbleButtonState;
  if (isTopicPending) {
    buttonState = 'play'; // 恢复主题
  } else if (phase === 'lecturePlaying') {
    buttonState = 'bars'; // 呼吸条 + 悬停暂停
  } else if (phase === 'discussionActive') {
    buttonState = 'bars';
  } else if (phase === 'completed') {
    buttonState = 'restart';
  } else if (phase === 'idle' || phase === 'lecturePaused') {
    buttonState = 'play';
  } else {
    buttonState = 'none';
  }

  // ---- isTopicActive ----
  const isTopicActive =
    chatIsStreaming || isTopicPending || isCueUser || engineMode === 'live' || !!discussionTrigger;

  return {
    phase,
    sourceText,
    bubbleRole,
    activeRole,
    buttonState,
    isInLiveFlow,
    isTopicActive,
  };
}
