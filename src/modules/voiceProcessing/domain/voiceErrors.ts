import { ExternalServiceError } from '../../../shared/domain/errors/AppError';

/**
 * A voice message in which nothing was heard (FT-123): the bot answers «Не расслышал» with an example phrase.
 * Still an ExternalServiceError, so the API answers as it did before.
 */
export class NoSpeechDetectedError extends ExternalServiceError {
  constructor() {
    super('Voice Transcription', new Error('No speech detected in audio'));
  }
}
