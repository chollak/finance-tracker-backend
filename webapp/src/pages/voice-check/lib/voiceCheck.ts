/**
 * Pure helpers for the FT-088 voice spike page: which audio format the WebView can record, how the
 * file must be labelled for the server's MIME whitelist, and the plain-text report Shukur pastes back.
 */

/**
 * Candidates in order of preference. Each base type is in the server's ALLOWED_AUDIO_TYPES; the server
 * converts every upload to mp3 with ffmpeg before Whisper.
 */
export const RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export function pickRecordingMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return RECORDING_MIME_CANDIDATES.find(type => isTypeSupported(type)) ?? null;
}

/**
 * The upload filter on the server compares the MIME type exactly (`audio/webm`), while browsers
 * report codecs (`audio/webm;codecs=opus`). The file is sent with the base type.
 */
export function baseMimeType(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function fileExtensionFor(type: string): string {
  const base = baseMimeType(type);
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
  };
  return map[base] ?? 'audio';
}

export interface VoiceCheckEnvironment {
  telegramPlatform: string | null;
  telegramVersion: string | null;
  userAgent: string;
  hasMediaDevices: boolean;
  hasMediaRecorder: boolean;
  supportedTypes: string[];
}

export type VoiceCheckStep =
  | { step: 'permission'; ok: boolean; detail?: string }
  | { step: 'recording'; ok: boolean; mimeType?: string; bytes?: number; seconds?: number; detail?: string }
  | { step: 'upload'; ok: boolean; status?: number; recognizedText?: string; transactions?: number; detail?: string };

function yesNo(value: boolean): string {
  return value ? 'да' : 'нет';
}

/** One block of plain text that can be pasted into a chat or into docs/tasks/decisions.md. */
export function buildVoiceCheckReport(env: VoiceCheckEnvironment, steps: VoiceCheckStep[]): string {
  const lines = [
    'FT-088 · проверка голоса в mini app',
    `Telegram: ${env.telegramPlatform ? `${env.telegramPlatform} ${env.telegramVersion ?? ''}`.trim() : 'не в Telegram'}`,
    `Браузер: ${env.userAgent}`,
    `mediaDevices: ${yesNo(env.hasMediaDevices)} · MediaRecorder: ${yesNo(env.hasMediaRecorder)}`,
    `Форматы записи: ${env.supportedTypes.length > 0 ? env.supportedTypes.join(', ') : 'ни одного'}`,
  ];

  for (const step of steps) {
    if (step.step === 'permission') {
      lines.push(`Доступ к микрофону: ${step.ok ? 'дан' : 'нет'}${step.detail ? ` (${step.detail})` : ''}`);
    } else if (step.step === 'recording') {
      lines.push(step.ok
        ? `Запись: ${step.mimeType || 'тип не сообщён'} · ${step.bytes} байт · ${step.seconds?.toFixed(1)} с`
        : `Запись: не удалась${step.detail ? ` (${step.detail})` : ''}`);
    } else {
      lines.push(step.ok
        ? `Распознавание: «${step.recognizedText ?? ''}» · записей создано: ${step.transactions ?? 0}`
        : `Распознавание: ошибка${step.status ? ` ${step.status}` : ''}${step.detail ? ` (${step.detail})` : ''}`);
    }
  }

  return lines.join('\n');
}
