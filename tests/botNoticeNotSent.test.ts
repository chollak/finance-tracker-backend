import { sendOrNotSent } from '../src/delivery/messaging/telegram/utils/notSent';
import { NoticeNotSentError } from '../src/modules/notification/domain/noticeNotSent';

/** FT-144: only a request that never left the machine becomes NoticeNotSentError; anything else stays as it was. */
describe('sendOrNotSent', () => {
  const failing = (error: unknown) => () => Promise.reject(error);

  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])('%s on the error: not sent', async (code) => {
    await expect(sendOrNotSent(failing(Object.assign(new Error('fetch failed'), { code })))).rejects.toBeInstanceOf(NoticeNotSentError);
  });

  it('the code on the cause, as Node fetch puts it: not sent, and the cause is kept for the log', async () => {
    const error = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });

    await expect(sendOrNotSent(failing(error))).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      context: { originalError: 'fetch failed' },
    });
  });

  it.each([
    ['a timeout', Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' })],
    ['a reset connection', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
    // On a reused keep-alive connection these come after the request was written
    ['an unreachable network', Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' })],
    ['an unreachable host', Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' })],
    ['the body read failing after Telegram answered', Object.assign(new Error('Invalid response body while trying to fetch'), { code: 'ECONNRESET' })],
    ['Telegram refusing', new Error('403: Forbidden: bot was blocked by the user')],
    ['a thrown string', 'boom'],
  ])('%s is thrown as it was', async (_name, error) => {
    await expect(sendOrNotSent(failing(error))).rejects.toBe(error);
  });

  it('passes the answer through', async () => {
    await expect(sendOrNotSent(() => Promise.resolve({ message_id: 7 }))).resolves.toEqual({ message_id: 7 });
  });
});
