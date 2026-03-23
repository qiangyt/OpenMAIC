import { useState, useEffect, useCallback, useRef } from 'react';

export interface StreamingTextOptions {
  text: string;
  speed?: number; // 每秒字符数，默认 30
  onComplete?: () => void;
  enabled?: boolean; // 是否启用流式显示，默认 true
}

export interface StreamingTextResult {
  displayedText: string;
  isStreaming: boolean;
  skip: () => void;
  reset: () => void;
}

/**
 * 流式文本 Hook
 *
 * 实现逐字符文本显示效果
 *
 * @param options - 配置选项
 * @returns 流式文本状态和控制函数
 */
export function useStreamingText(options: StreamingTextOptions): StreamingTextResult {
  const { text, speed = 30, onComplete, enabled = true } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastIndexRef = useRef(0);

  /**
   * 跳过流式动画，立即显示所有文本
   */
  const skip = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setDisplayedText(text);
    setIsStreaming(false);
    startTimeRef.current = null;
    lastIndexRef.current = text.length;
    onComplete?.();
  }, [text, onComplete]);

  /**
   * 重置流式状态
   */
  const reset = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setDisplayedText('');
    setIsStreaming(false);
    startTimeRef.current = null;
    lastIndexRef.current = 0;
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 动画驱动器：流式文本显示的同步状态转换是有意为之 */
    // 如果流式显示禁用或文本为空，立即显示所有文本
    if (!enabled || !text) {
      setDisplayedText((prev) => (prev !== text ? text : prev));
      setIsStreaming((prev) => (prev ? false : prev));
      return;
    }

    // 限制最大文本长度（超过 500 字符的文本禁用流式显示）
    if (text.length > 500) {
      setDisplayedText(text);
      setIsStreaming(false);
      onComplete?.();
      return;
    }

    // 开始流式显示
    setIsStreaming(true);
    setDisplayedText('');
    /* eslint-enable react-hooks/set-state-in-effect */
    lastIndexRef.current = 0;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const targetIndex = Math.min(Math.floor((elapsed / 1000) * speed), text.length);

      if (targetIndex > lastIndexRef.current) {
        lastIndexRef.current = targetIndex;
        setDisplayedText(text.slice(0, targetIndex));
      }

      if (targetIndex < text.length) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setIsStreaming(false);
        startTimeRef.current = null;
        onComplete?.();
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [text, speed, enabled, onComplete]);

  return {
    displayedText,
    isStreaming,
    skip,
    reset,
  };
}
