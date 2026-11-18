import { ExternalServiceError, StorageError } from '../../../shared/domain/errors/AppError';

/**
 * A voice message in which nothing was heard (FT-123): the bot answers «Не расслышал» with an example phrase.
 * Still an ExternalServiceError, so the API answers as it did before.
 */
export class NoSpeechDetectedError extends ExternalServiceError {
  constructor() {
    super('Voice Transcription', new Error('No speech detected in audio'));
  }
}

/**
 * A record of a phrase, a voice or an answer to «Сколько?» could not be written (#299): the database is busy, the
 * disk, a lookup that threw. Nothing of the phrase is left written, so the same capture can be sent again — the iOS
 * queue and the Mini App do it on a 5xx, the bot asks the person to. A `StorageError`: `500 INTERNAL_ERROR` with this
 * message only, the cause is in the log. Before, the record was dropped silently and the answer was «не нашёл
 * операцию», which a client takes as final.
 */
export class CaptureNotSavedError extends StorageError {
  constructor() {
    super('The capture was not saved, send it again');
  }
}
