import { ExternalServiceError } from '../../../shared/domain/errors/AppError';

/**
 * The notice never left this machine — no DNS after sleep, the connection refused — so nothing reached
 * Telegram: the claim is given up and the next tick sends it (FT-144). A sender throws it only when that is certain;
 * a timeout or a reset connection may have delivered the message and stays a failure, never sent twice.
 */
export class NoticeNotSentError extends ExternalServiceError {
  constructor(cause: Error) {
    super('Telegram', cause);
  }

  /** What went wrong underneath («getaddrinfo ENOTFOUND api.telegram.org»), for the log. */
  get reason(): string {
    return String(this.context?.originalError ?? this.message);
  }
}
