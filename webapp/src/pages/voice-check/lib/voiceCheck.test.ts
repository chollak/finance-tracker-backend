import { describe, expect, it } from 'vitest';
import {
  baseMimeType,
  buildVoiceCheckReport,
  fileExtensionFor,
  pickRecordingMimeType,
} from './voiceCheck';

describe('voice check helpers (FT-088)', () => {
  it('picks the first recording format the WebView supports', () => {
    expect(pickRecordingMimeType(type => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecordingMimeType(type => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });

  it('strips codecs so the server whitelist accepts the file', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseMimeType('Audio/MP4')).toBe('audio/mp4');
  });

  it('names the file by its format', () => {
    expect(fileExtensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(fileExtensionFor('audio/mp4')).toBe('m4a');
    expect(fileExtensionFor('audio/x-unknown')).toBe('audio');
  });

  it('builds a report that can be pasted back as text', () => {
    const report = buildVoiceCheckReport(
      {
        telegramPlatform: 'ios',
        telegramVersion: '8.0',
        userAgent: 'Mozilla/5.0 (iPhone)',
        hasMediaDevices: true,
        hasMediaRecorder: true,
        supportedTypes: ['audio/mp4'],
      },
      [
        { step: 'permission', ok: true },
        { step: 'recording', ok: true, mimeType: 'audio/mp4', bytes: 48211, seconds: 5 },
        { step: 'upload', ok: true, recognizedText: 'проверка микрофона', transactions: 0 },
      ]
    );

    expect(report).toContain('Telegram: ios 8.0');
    expect(report).toContain('Форматы записи: audio/mp4');
    expect(report).toContain('Доступ к микрофону: дан');
    expect(report).toContain('Запись: audio/mp4 · 48211 байт · 5.0 с');
    expect(report).toContain('Распознавание: «проверка микрофона» · записей создано: 0');
  });

  it('reports a denied microphone and an upload error plainly', () => {
    const report = buildVoiceCheckReport(
      { telegramPlatform: null, telegramVersion: null, userAgent: 'UA', hasMediaDevices: false, hasMediaRecorder: false, supportedTypes: [] },
      [
        { step: 'permission', ok: false, detail: 'NotAllowedError' },
        { step: 'upload', ok: false, status: 400, detail: 'Invalid file type' },
      ]
    );

    expect(report).toContain('Telegram: не в Telegram');
    expect(report).toContain('Форматы записи: ни одного');
    expect(report).toContain('Доступ к микрофону: нет (NotAllowedError)');
    expect(report).toContain('Распознавание: ошибка 400 (Invalid file type)');
  });
});
