import { describe, it, expect } from 'vitest';

import { toCaptureErrorFeedback } from './toCaptureErrorFeedback';
import { CaptureTextError } from '../api/mutations';
import { GuestAccessError } from '@/entities/transaction/api/mutations';

// A failed capture wrote nothing, so none of these may read as a save. Two error shapes
// arrive here: real Errors thrown before the request, and the plain `{ message, statusCode }`
// objects `apiClient` throws (docs/QUICK_CAPTURE_API.md — auth/rate-limit middleware answer
// before the handler and use their own envelope).
describe('toCaptureErrorFeedback', () => {
  it('explains guest mode instead of blaming the input', () => {
    const feedback = toCaptureErrorFeedback(new GuestAccessError('быстрой записи текстом'));

    expect(feedback.tone).toBe('info');
    expect(feedback.title).toBe('В гостевом режиме недоступно');
    expect(feedback.description).toContain('Telegram');
    expect(feedback.actionable).toBe(true);
  });

  it('surfaces the client-side text rejection message', () => {
    const feedback = toCaptureErrorFeedback(new CaptureTextError('too_long'));

    expect(feedback.tone).toBe('warning');
    expect(feedback.title).toContain('2000');
    expect(feedback.actionable).toBe(true);
  });

  it('maps the shared AI rate limit to a wait-and-retry message', () => {
    const feedback = toCaptureErrorFeedback({ message: 'Request failed', statusCode: 429 });

    expect(feedback.title).toBe('Слишком много запросов');
    expect(feedback.actionable).toBe(false);
  });

  it('asks for Telegram auth on 401', () => {
    const feedback = toCaptureErrorFeedback({ message: 'Request failed', statusCode: 401 });

    expect(feedback.title).toBe('Нужна авторизация');
    expect(feedback.actionable).toBe(true);
  });

  it('reports a network failure (apiClient statusCode 0) as unsaved', () => {
    const feedback = toCaptureErrorFeedback({ message: 'Network error', statusCode: 0 });

    expect(feedback.title).toBe('Нет связи с сервером');
    expect(feedback.description).toContain('не сохранена');
  });

  it('falls back to the server message for other failures', () => {
    const feedback = toCaptureErrorFeedback({
      message: 'Text is required and cannot be empty',
      statusCode: 400,
    });

    expect(feedback.tone).toBe('warning');
    expect(feedback.title).toBe('Не удалось записать');
    expect(feedback.description).toBe('Text is required and cannot be empty');
  });

  it('degrades gracefully on a non-object rejection', () => {
    const feedback = toCaptureErrorFeedback('boom');

    expect(feedback.tone).toBe('warning');
    expect(feedback.title).toBe('Не удалось записать');
    expect(feedback.description).toContain('не сохранена');
  });
});
