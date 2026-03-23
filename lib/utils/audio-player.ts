/**
 * 音频播放器 - 音频播放接口
 *
 * 处理音频播放、暂停、停止等操作
 * 从 IndexedDB 加载预生成的 TTS 音频文件
 *
 */

import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioPlayer');

/**
 * 音频播放器实现
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private onEndedCallback: (() => void) | null = null;
  private muted: boolean = false;
  private volume: number = 1;
  private playbackRate: number = 1;

  /**
   * 播放音频（从 URL 或 IndexedDB 预生成缓存）
   * @param audioId 音频 ID
   * @param audioUrl 可选的服务器生成的音频 URL（优先于 IndexedDB）
   * @returns 如果音频开始播放返回 true，如果没有音频（TTS 禁用或未生成）返回 false
   */
  public async play(audioId: string, audioUrl?: string): Promise<boolean> {
    try {
      // 1. 首先尝试 audioUrl（服务器生成的 TTS）
      if (audioUrl) {
        this.stop();
        this.audio = new Audio();
        this.audio.src = audioUrl;
        if (this.muted) this.audio.volume = 0;
        else this.audio.volume = this.volume;
        this.audio.defaultPlaybackRate = this.playbackRate;
        this.audio.playbackRate = this.playbackRate;
        this.audio.addEventListener('ended', () => {
          this.onEndedCallback?.();
        });
        await this.audio.play();
        this.audio.playbackRate = this.playbackRate;
        return true;
      }

      // 2. 回退到 IndexedDB（客户端生成的 TTS）
      const audioRecord = await db.audioFiles.get(audioId);

      if (!audioRecord) {
        // 预生成的音频不存在（生成失败），静默跳过
        return false;
      }

      // 停止当前播放
      this.stop();

      // 创建音频元素
      this.audio = new Audio();

      // 设置音频源
      const blobUrl = URL.createObjectURL(audioRecord.blob);
      this.audio.src = blobUrl;
      if (this.muted) this.audio.volume = 0;
      else this.audio.volume = this.volume;

      // 应用播放速率
      this.audio.defaultPlaybackRate = this.playbackRate;
      this.audio.playbackRate = this.playbackRate;

      // 设置结束回调
      this.audio.addEventListener('ended', () => {
        URL.revokeObjectURL(blobUrl);
        this.onEndedCallback?.();
      });

      // 播放
      await this.audio.play();
      // play() 后重新应用 — 某些浏览器在加载时会重置
      this.audio.playbackRate = this.playbackRate;
      return true;
    } catch (error) {
      log.error('Failed to play audio:', error);
      throw error;
    }
  }

  /**
   * 暂停播放
   */
  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  /**
   * 停止播放
   */
  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    // 注意：此处故意不清除 onEndedCallback，因为 play() 内部会调用 stop()
    // 清除会破坏回调链。过期的回调无害：引擎模式检查会阻止 processNext()。
  }

  /**
   * 恢复播放
   */
  public resume(): void {
    if (this.audio?.paused) {
      this.audio.playbackRate = this.playbackRate;
      this.audio.play().catch((error) => {
        log.error('Failed to resume audio:', error);
      });
    }
  }

  /**
   * 获取当前播放状态（正在播放，未暂停）
   */
  public isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  /**
   * 是否有活动音频（正在播放或暂停，但未结束）
   * 用于决定是恢复播放还是跳到下一行
   */
  public hasActiveAudio(): boolean {
    return this.audio !== null;
  }

  /**
   * 获取当前播放时间（毫秒）
   */
  public getCurrentTime(): number {
    return this.audio ? this.audio.currentTime * 1000 : 0;
  }

  /**
   * 获取音频时长（毫秒）
   */
  public getDuration(): number {
    return this.audio && !isNaN(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  /**
   * 设置播放结束回调
   */
  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * 设置静音状态（立即对当前播放的音频生效）
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.volume;
    }
  }

  /**
   * 设置音量（0-1）
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio && !this.muted) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * 设置播放速度（立即对当前播放的音频生效）
   */
  public setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, rate));
    if (this.audio) {
      this.audio.playbackRate = this.playbackRate;
    }
  }

  /**
   * 销毁播放器
   */
  public destroy(): void {
    this.stop();
    this.onEndedCallback = null;
  }
}

/**
 * 创建音频播放器实例
 */
export function createAudioPlayer(): AudioPlayer {
  return new AudioPlayer();
}
