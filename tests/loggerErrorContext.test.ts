import { createLogger, winstonLogger } from '../src/shared/infrastructure/logging';
import { ExternalServiceError } from '../src/shared/domain/errors/AppError';

/**
 * An AppError keeps its cause in `context` («External service error: OpenAI Chat» wraps `model_not_found`).
 * The log shows it, so a withdrawn model reads as such, not as a bare wrapper.
 */
describe('logger.error', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes what an AppError keeps about its cause, with secrets still redacted', () => {
    const write = jest.spyOn(winstonLogger, 'error').mockImplementation(() => winstonLogger);
    const error = new ExternalServiceError('OpenAI Chat', new Error('404 The model `gpt-4-turbo` does not exist'));
    Object.assign(error.context!, { apiKey: 'sk-secret' });

    createLogger('TEST').error('Text message error', error, { userId: 'u-1' });

    expect(write).toHaveBeenCalledWith('Text message error', expect.objectContaining({
      error: 'External service error: OpenAI Chat',
      errorContext: { originalError: '404 The model `gpt-4-turbo` does not exist', apiKey: '[REDACTED]' },
      userId: 'u-1',
    }));
  });

  it('adds nothing for a plain Error', () => {
    const write = jest.spyOn(winstonLogger, 'error').mockImplementation(() => winstonLogger);

    createLogger('TEST').error('Failed', new Error('boom'));

    expect((write.mock.calls[0] as unknown[])[1]).not.toHaveProperty('errorContext');
  });
});
