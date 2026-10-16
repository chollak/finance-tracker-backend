import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import {
  RECORDING_MIME_CANDIDATES,
  baseMimeType,
  buildVoiceCheckReport,
  fileExtensionFor,
  pickRecordingMimeType,
  type VoiceCheckEnvironment,
  type VoiceCheckStep,
} from '../lib/voiceCheck';

const RECORD_SECONDS = 5;

interface VoiceUploadResponse {
  data?: { text?: string; transactions?: unknown[] };
  text?: string;
  transactions?: unknown[];
}

function readEnvironment(): VoiceCheckEnvironment {
  const telegram = window.Telegram?.WebApp;
  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  return {
    telegramPlatform: telegram?.platform && telegram.platform !== 'unknown' ? telegram.platform : null,
    telegramVersion: telegram?.version ?? null,
    userAgent: navigator.userAgent,
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder,
    supportedTypes: hasMediaRecorder
      ? RECORDING_MIME_CANDIDATES.filter(type => MediaRecorder.isTypeSupported(type))
      : [],
  };
}

/**
 * FT-088 spike: can the Telegram WebView record audio, in which format, and does Whisper understand it?
 * Not linked from the app — open /dev/voice-check inside the Mini App on each device and copy the report.
 */
export function VoiceCheckPage() {
  const env = useMemo(readEnvironment, []);
  const userId = useUserStore(state => state.userId);
  const userName = useUserStore(state => state.userName);
  const [steps, setSteps] = useState<VoiceCheckStep[]>([]);
  const [busy, setBusy] = useState<'recording' | 'uploading' | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [recording, setRecording] = useState<{ blob: Blob; mimeType: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<string | null>(null);
  const reportRef = useRef<HTMLPreElement | null>(null);
  const userType = useUserStore(state => state.userType);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const report = buildVoiceCheckReport(env, steps);
  const addStep = (step: VoiceCheckStep) => setSteps(previous => [...previous.filter(s => s.step !== step.step), step]);

  async function record() {
    setSteps([]);
    setRecording(null);
    setBusy('recording');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      addStep({ step: 'permission', ok: true });
    } catch (error) {
      addStep({ step: 'permission', ok: false, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      setBusy(null);
      return;
    }

    try {
      const mimeType = pickRecordingMimeType(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = performance.now();
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>(resolve => {
        recorder.onstop = () => resolve();
      });
      // A timeslice makes WebKit deliver data during recording instead of only at stop.
      recorder.start(250);
      for (let left = RECORD_SECONDS; left > 0; left -= 1) {
        setSecondsLeft(left);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      recorder.stop();
      await stopped;
      // Report what the recorder said, even if it said nothing; upload falls back to the picked type.
      const reportedType = recorder.mimeType || '';
      const blob = new Blob(chunks, { type: reportedType || mimeType || 'audio/webm' });
      const seconds = (performance.now() - started) / 1000;
      if (blob.size === 0) {
        addStep({ step: 'recording', ok: false, mimeType: reportedType, detail: 'запись пустая: 0 байт' });
        return;
      }
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setRecording({ blob, mimeType: blob.type, url });
      addStep({ step: 'recording', ok: true, mimeType: reportedType, bytes: blob.size, seconds });
    } catch (error) {
      addStep({ step: 'recording', ok: false, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    } finally {
      stream.getTracks().forEach(track => track.stop());
      setSecondsLeft(0);
      setBusy(null);
    }
  }

  async function upload() {
    if (!recording || !userId) return;
    setBusy('uploading');
    const form = new FormData();
    const type = baseMimeType(recording.mimeType);
    form.append('audio', new File([recording.blob], `voice-check.${fileExtensionFor(type)}`, { type }));
    form.append('userId', userId);
    if (userName) form.append('userName', userName);
    try {
      const response = await apiClient.upload<VoiceUploadResponse>(API_ENDPOINTS.VOICE.VOICE_INPUT, form) as VoiceUploadResponse;
      const payload = response.data ?? response;
      addStep({ step: 'upload', ok: true, recognizedText: payload.text ?? '', transactions: payload.transactions?.length ?? 0 });
    } catch (error) {
      const apiError = error as { statusCode?: number; message?: string; serverMessage?: string; code?: string };
      const detail = [apiError.code, apiError.serverMessage ?? apiError.message].filter(Boolean).join(': ');
      addStep({ step: 'upload', ok: false, status: apiError.statusCode, detail });
    } finally {
      setBusy(null);
    }
  }

  async function copyReport() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some Telegram WebViews have no clipboard API: select the text so the system menu can copy it.
      const node = reportRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Проверка голоса</h1>
        <p className="text-sm text-muted-foreground">
          Служебная страница для FT-088. Откройте её внутри Telegram на каждом устройстве, запишите фразу
          без сумм — например, «проверка микрофона, раз, два, три» — и скопируйте отчёт.
        </p>
      </header>

      <Button size="lg" onClick={record} disabled={busy !== null || !env.hasMediaDevices || !env.hasMediaRecorder}>
        {busy === 'recording' ? `Записываю… ${secondsLeft}` : `1. Записать ${RECORD_SECONDS} секунд`}
      </Button>

      {recording && (
        <audio controls src={recording.url} className="w-full" aria-label="Прослушать запись" />
      )}

      <Button size="lg" variant="secondary" onClick={upload} disabled={busy !== null || !recording || !userId}>
        {busy === 'uploading' ? 'Распознаю…' : '2. Отправить на распознавание'}
      </Button>
      {(!userId || userType === 'guest') && (
        <p className="text-sm text-muted-foreground">
          {userId ? 'Вы не в Telegram: запись уйдёт от гостя. Для проверки откройте страницу кнопкой меню бота.' : 'Нет пользователя — откройте страницу из Telegram.'}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">Отчёт</h2>
        <pre ref={reportRef} className="select-text whitespace-pre-wrap break-words rounded-2xl bg-card p-4 text-xs leading-relaxed">{report}</pre>
        <Button variant="outline" onClick={copyReport}>{copied ? 'Скопировано' : 'Скопировать отчёт'}</Button>
      </section>
    </main>
  );
}
