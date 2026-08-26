/**
 * Сообщения AppError написаны для разработчика ('External service error: OpenAI
 * Transcription'). После того как у клиента OpenAI появился потолок ожидания
 * в 25 секунд, отказ внешнего сервиса стал ожидаемым исходом, а не экзотикой —
 * и пользователь не должен видеть внутреннюю формулировку.
 */
import { userFacingMessage } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import {
  AppError,
  ExternalServiceError,
  ValidationError,
} from '../src/shared/domain/errors/AppError';
import { RU } from '../src/delivery/messaging/telegram/i18n/ru';

describe('текст ошибки для пользователя', () => {
  it('на отказ внешнего сервиса отвечает по-человечески', () => {
    const error = new ExternalServiceError('OpenAI Transcription', new Error('timeout'));

    const message = userFacingMessage(error);

    expect(message).toContain(RU.errors.aiUnavailable);
    expect(message).not.toContain('External service error');
    expect(message).not.toContain('OpenAI');
  });

  it('прикладную ошибку показывает как есть — она писалась для человека', () => {
    const error: AppError = new ValidationError('Сумма должна быть больше нуля');

    expect(userFacingMessage(error)).toContain('Сумма должна быть больше нуля');
  });

  it('на неизвестную ошибку даёт общий текст, не раскрывая внутренности', () => {
    const message = userFacingMessage(new Error('ECONNREFUSED 127.0.0.1:5432'));

    expect(message).toBe(RU.errors.generic);
    expect(message).not.toContain('ECONNREFUSED');
  });
});
