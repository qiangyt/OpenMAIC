'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ensureVoicesLoaded,
  isBrowserTTSAbortError,
  playBrowserTTSPreview,
} from '@/lib/audio/browser-tts-preview';

export interface TTSPreviewOptions {
  text: string;
  providerId: string;
  voice: string;
  speed: number;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * TTS 预览播放的共享 Hook（浏览器原生和基于 API）。
 *
 * - `previewing`：预览激活时为 true（包括音频播放中）
 * - `startPreview(opts)`：开始预览；非中止错误会抛出
 * - `stopPreview()`：取消任何活动预览并重置状态
 */
export function useTTSPreview() {
  const [previewing, setPreviewing] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const requestIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  /** 取消进行中的工作并释放资源（不更新状态）。 */
  const cleanup = useCallback(() => {
    requestIdRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  /** 取消任何活动预览并重置 previewing 标志。 */
  const stopPreview = useCallback(() => {
    cleanup();
    setPreviewing(false);
  }, [cleanup]);

  // 卸载时清理（跳过状态更新以避免 React 警告）。
  useEffect(() => cleanup, [cleanup]);

  /**
   * 开始 TTS 预览。
   * 中止错误会被吞掉；所有其他错误会重新抛出给调用者。
   */
  const startPreview = useCallback(
    async (options: TTSPreviewOptions): Promise<void> => {
      cleanup();
      const requestId = ++requestIdRef.current;
      const isStale = () => requestIdRef.current !== requestId;

      setPreviewing(true);
      try {
        if (options.providerId === 'browser-native-tts') {
          if (typeof window === 'undefined' || !window.speechSynthesis) {
            throw new Error('Browser does not support Speech Synthesis API');
          }
          const voices = await ensureVoicesLoaded();
          if (isStale()) return;
          if (voices.length === 0) {
            throw new Error('No browser TTS voices available');
          }
          const controller = playBrowserTTSPreview({
            text: options.text,
            voice: options.voice,
            rate: options.speed,
            voices,
          });
          cancelRef.current = controller.cancel;
          await controller.promise;
          if (!isStale()) {
            cancelRef.current = null;
            setPreviewing(false);
          }
          return;
        }

        // 基于 API 的 TTS
        const body: Record<string, unknown> = {
          text: options.text,
          audioId: 'preview',
          ttsProviderId: options.providerId,
          ttsVoice: options.voice,
          ttsSpeed: options.speed,
        };
        if (options.apiKey?.trim()) body.ttsApiKey = options.apiKey;
        if (options.baseUrl?.trim()) body.ttsBaseUrl = options.baseUrl;

        const res = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (isStale()) return;

        const data = await res.json().catch(() => ({ error: res.statusText }));
        if (isStale()) return;

        if (!res.ok || !data.base64) {
          throw new Error(data.error || 'TTS preview failed');
        }

        // 解码 base64 → Blob → Object URL
        const binaryStr = atob(data.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: `audio/${data.format || 'mp3'}` });

        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (!isStale()) {
            audioRef.current = null;
            setPreviewing(false);
          }
        };
        audio.onerror = () => {
          if (!isStale()) {
            audioRef.current = null;
            setPreviewing(false);
          }
        };
        await audio.play();
      } catch (error) {
        if (!isStale()) {
          cancelRef.current = null;
          setPreviewing(false);
        }
        if (!isBrowserTTSAbortError(error)) {
          throw error;
        }
      }
    },
    [cleanup],
  );

  return { previewing, startPreview, stopPreview };
}
