import { NoticeNotSentError } from '../../../../modules/notification/domain/noticeNotSent';

/**
 * System error codes raised before any connection exists, so the request never left this machine: the name did not
 * resolve (no network after sleep) or the connection was refused. Not here: a timeout, a reset, and the «unreachable»
 * codes — on a reused keep-alive connection they come after the request was written, and the message may have
 * reached Telegram (FT-144).
 */
const NEVER_LEFT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']);

function codeOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  // node-fetch under Telegraf puts the code on the error; Node's fetch puts it on the cause
  return code ?? cause?.code;
}

/** Sends a notice the scheduler sends on its own; one that never left the machine throws NoticeNotSentError. */
export async function sendOrNotSent<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    const code = codeOf(error);
    if (typeof code === 'string' && NEVER_LEFT.has(code)) {
      throw new NoticeNotSentError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}
