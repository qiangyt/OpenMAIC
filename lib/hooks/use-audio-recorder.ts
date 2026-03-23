import { useState, useRef, useCallback } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioRecorder');

// Web Speech API 的 TypeScript 声明
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed in lib.dom
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed in lib.dom
    webkitSpeechRecognition: any;
  }
}

export interface UseAudioRecorderOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onTranscription, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed
  const speechRecognitionRef = useRef<any>(null);

  // 发送音频到服务器进行转录
  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        // 从设置存储获取当前 ASR 配置
        // 注意：这需要在浏览器上下文中导入 useSettingsStore
        if (typeof window !== 'undefined') {
          const { useSettingsStore } = await import('@/lib/store/settings');
          const { asrProviderId, asrLanguage, asrProvidersConfig } = useSettingsStore.getState();

          formData.append('providerId', asrProviderId);
          formData.append('language', asrLanguage);

          // 如果已配置则添加 API 密钥和基础 URL
          const providerConfig = asrProvidersConfig?.[asrProviderId];
          if (providerConfig?.apiKey?.trim()) {
            formData.append('apiKey', providerConfig.apiKey);
          }
          if (providerConfig?.baseUrl?.trim()) {
            formData.append('baseUrl', providerConfig.baseUrl);
          }
        }

        const response = await fetch('/api/transcription', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Transcription failed');
        }

        const result = await response.json();
        onTranscription?.(result.text);
      } catch (error) {
        log.error('Transcription error:', error);
        onError?.(error instanceof Error ? error.message : '语音识别失败，请重试');
      } finally {
        setIsProcessing(false);
        setRecordingTime(0);
      }
    },
    [onTranscription, onError],
  );

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      // 获取当前 ASR 配置
      if (typeof window !== 'undefined') {
        const { useSettingsStore } = await import('@/lib/store/settings');
        const { asrProviderId, asrLanguage } = useSettingsStore.getState();

        // 如果配置了浏览器原生 ASR 则使用
        if (asrProviderId === 'browser-native') {
          // 检查是否支持语音识别
          if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            onError?.('您的浏览器不支持语音识别功能');
            return;
          }

          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const recognition = new SpeechRecognition();

          recognition.lang = asrLanguage || 'zh-CN';
          recognition.continuous = false;
          recognition.interimResults = false;

          recognition.onstart = () => {
            setIsRecording(true);
            setRecordingTime(0);

            // 启动计时器
            timerRef.current = setInterval(() => {
              setRecordingTime((prev) => prev + 1);
            }, 1000);
          };

          recognition.onresult = (event: {
            results: {
              [index: number]: { [index: number]: { transcript: string } };
            };
          }) => {
            const transcript = event.results[0][0].transcript;
            onTranscription?.(transcript);
          };

          recognition.onerror = (event: { error: string }) => {
            log.error('Speech recognition error:', event.error);
            let errorMessage = '语音识别失败';

            switch (event.error) {
              case 'no-speech':
                errorMessage = '未检测到语音输入';
                break;
              case 'audio-capture':
                errorMessage = '无法访问麦克风';
                break;
              case 'not-allowed':
                errorMessage = '麦克风权限被拒绝';
                break;
              case 'network':
                errorMessage = '网络错误';
                break;
              default:
                errorMessage = `语音识别错误: ${event.error}`;
            }

            onError?.(errorMessage);
            setIsRecording(false);
            setRecordingTime(0);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          };

          recognition.onend = () => {
            setIsRecording(false);
            setRecordingTime(0);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
          return;
        }
      }

      // 使用 MediaRecorder 进行服务器端 ASR
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // 停止所有音频轨道
        stream.getTracks().forEach((track) => track.stop());

        // 合并音频块
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });

        // 发送到服务器进行转录
        await transcribeAudio(audioBlob);
      };

      // 开始录音
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // 启动计时器
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      log.error('Failed to start recording:', error);
      onError?.('无法访问麦克风，请检查权限设置');
    }
  }, [onTranscription, onError, transcribeAudio]);

  // 停止录音
  const stopRecording = useCallback(() => {
    // 如果活动则停止语音识别
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // 如果活动则停止 MediaRecorder
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // 取消录音
  const cancelRecording = useCallback(() => {
    // 如果活动则取消语音识别
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.onresult = null; // 阻止转录回调
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      setIsRecording(false);
      setRecordingTime(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // 如果活动则取消 MediaRecorder
    if (mediaRecorderRef.current && isRecording) {
      // 停止录音但不转录
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();

      // 停止所有音频轨道
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }

      setIsRecording(false);
      setRecordingTime(0);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      audioChunksRef.current = [];
    }
  }, [isRecording]);

  return {
    isRecording,
    isProcessing,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
