/**
 * 浏览器原生 ASR（语音识别）Hook
 * 使用 Web Speech API 进行客户端语音识别
 * 完全免费，无需 API 密钥
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('BrowserASR');

// 注意：Window.SpeechRecognition 声明在 components/ai-elements/prompt-input.tsx 中

export type ASRErrorCode =
  | 'not-supported'
  | 'no-speech'
  | 'audio-capture'
  | 'not-allowed'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface UseBrowserASROptions {
  onTranscription?: (text: string) => void;
  onError?: (errorCode: ASRErrorCode) => void;
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export function useBrowserASR(options: UseBrowserASROptions = {}) {
  const {
    onTranscription,
    onError,
    language = 'zh-CN',
    continuous = false,
    interimResults = false,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API SpeechRecognition not typed
  const recognitionRef = useRef<any>(null);

  // 使用 ref 存储回调以避免识别事件处理程序中的闭包过期问题
  const onTranscriptionRef = useRef(onTranscription);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
    onErrorRef.current = onError;
  }, [onTranscription, onError]);

  // SSR 安全的支持检测
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  );

  const startListening = useCallback(() => {
    // 检查是否支持语音识别
    if (
      typeof window === 'undefined' ||
      (!window.SpeechRecognition && !window.webkitSpeechRecognition)
    ) {
      onErrorRef.current?.('not-supported');
      return;
    }

    // 创建语音识别实例
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: {
      resultIndex: number;
      results: {
        [index: number]: {
          [index: number]: { transcript: string };
          isFinal: boolean;
        };
        length: number;
      };
    }) => {
      let finalTranscript = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (interimResults) {
        setInterimTranscript(interimText);
      }

      if (finalTranscript) {
        onTranscriptionRef.current?.(finalTranscript);
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: { error: string }) => {
      log.error('Speech recognition error:', event.error);
      const errorCodeMap: Record<string, ASRErrorCode> = {
        'no-speech': 'no-speech',
        'audio-capture': 'audio-capture',
        'not-allowed': 'not-allowed',
        network: 'network',
        aborted: 'aborted',
      };
      onErrorRef.current?.(errorCodeMap[event.error] ?? 'unknown');
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [language, continuous, interimResults]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      setInterimTranscript('');
    }
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    startListening,
    stopListening,
  };
}
