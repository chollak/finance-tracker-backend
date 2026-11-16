import 'reflect-metadata';
import { winstonLogger } from '../src/shared/infrastructure/logging';
import { RU } from '../src/delivery/messaging/telegram/i18n/ru';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { TelegramStand } from './helpers/telegramStand';

/**
 * #279: the bot handled only a text and a voice; a photo, an audio file, a video note, a video, a document and a
 * sticker got silence, and the person could not tell whether it arrived. Now each gets one line — what the bot
 * understands and how to write a record. Only after the closed access (FT-153): a stranger still gets nothing. The text
 * and the voice go to the capture as before, and none of the six reaches it. The bot is the one `startTelegramBot`
 * assembles, on the stand (`tests/helpers/telegramStand.ts`, #294): only polling, Telegram's API and the download of a
 * voice are fakes.
 */

// The voice is not downloaded: the voice pipeline is a fake that takes any path
jest.mock('../src/delivery/messaging/telegram/utils/fileDownloader', () => ({
  ...jest.requireActual('../src/delivery/messaging/telegram/utils/fileDownloader'),
  downloadVoiceFile: jest.fn(async () => '/nonexistent/voice.ogg'),
  cleanupFile: jest.fn(async () => undefined),
}));

const ALLOWED = 111;
const STRANGER = 222;
const UNSUPPORTED_ANSWER = 'Пока понимаю текст и голосовые. Напишите: такси 18к.';
// What Telegram draws as an emoji picture
const EMOJI = /\p{Emoji_Presentation}|️/u;

const file = (id: string) => ({ file_id: id, file_unique_id: `u-${id}` });

/**
 * What a person may send that the bot does not read — the five of the issue, a video (the coordinator's decision), a
 * photo with a caption and a GIF — as the Bot API sends them.
 */
const UNSUPPORTED: Array<[string, Record<string, unknown>]> = [
  ['a photo', { photo: [{ ...file('p1'), width: 90, height: 90 }] }],
  ['a photo with a caption (the caption is not read)', { photo: [{ ...file('p2'), width: 90, height: 90 }], caption: 'такси 18к' }],
  ['an audio file', { audio: { ...file('a1'), duration: 3 } }],
  ['a video note', { video_note: { ...file('vn1'), length: 240, duration: 3 } }],
  ['a video', { video: { ...file('vd1'), width: 1280, height: 720, duration: 5 } }],
  ['a document', { document: { ...file('d1'), file_name: 'чек.pdf' } }],
  ['a GIF (Telegram sends it with a document too)', { animation: { ...file('g1'), width: 90, height: 90, duration: 1 }, document: { ...file('g1') } }],
  ['a sticker', { sticker: { ...file('s1'), type: 'regular', width: 512, height: 512, is_animated: false, is_video: false } }],
];

// The free limit lets everything through; the bot registers its text and voice chains with it, as in production
const subscriptionModule = {
  getCheckLimitUseCase: () => ({ execute: async () => ({ allowed: true }) }),
  getIncrementUsageUseCase: () => ({ execute: async () => undefined }),
};

describe.each([
  ['with the subscription module, as in production', subscriptionModule],
  ['without the subscription module', undefined],
])('the bot answers what it does not read (#279), %s', (_branch, subscription) => {
  let db: TestDatabase;
  let stand: TelegramStand;
  const capture = jest.fn();
  const processVoice = jest.fn();

  /** A message of `sender` in their private chat with the bot. */
  function message(sender: number, content: Record<string, unknown>) {
    return stand.deliver(stand.messageUpdate(content, { from: { id: sender, first_name: 'Test' } }));
  }

  /** An album as Telegram sends it: one message per item, one `media_group_id`; photos and a video in the last place. */
  function albumItems(groupId: string, count: number): Array<Record<string, unknown>> {
    return Array.from({ length: count }, (_, index) => (index === count - 1
      ? { media_group_id: groupId, video: { ...file(`${groupId}-${index}`), width: 1280, height: 720, duration: 5 } }
      : { media_group_id: groupId, photo: [{ ...file(`${groupId}-${index}`), width: 90, height: 90 }] }));
  }

  async function album(sender: number, groupId: string, count: number): Promise<void> {
    for (const item of albumItems(groupId, count)) await message(sender, item);
  }

  /** The texts the bot sent after it started (the command menu goes out at start), with the chat as the bot named it. */
  const replies = () => stand.calls.filter(call => call.method === 'sendMessage').map(call => ({ chat: call.payload.chat_id, text: call.payload.text }));
  const usersInDb = async () => (await db.dataSource.query('SELECT telegram_id FROM users')).map((row: { telegram_id: string }) => row.telegram_id);

  beforeEach(async () => {
    jest.spyOn(winstonLogger, 'warn').mockImplementation(() => winstonLogger);
    // Nothing to write in what was said or written: the capture answers «Не нашёл, что записать»
    capture.mockReset().mockResolvedValue({ transactions: [], debts: [] });
    processVoice.mockReset().mockResolvedValue({ text: 'привет', transactions: [], debts: [] });

    db = await openMigratedDatabase();
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    const voiceModule = { getProcessVoiceInputUseCase: () => ({ execute: processVoice }) };
    const quickCaptureModule = { getQuickCaptureService: () => ({ capture }) };
    const transactionModule = { findByClientId: async () => [] };

    stand = new TelegramStand({ id: ALLOWED, first_name: 'Test' });
    stand.install({ allowed: [ALLOWED] });
    stand.start({ voiceModule, transactionModule, userModule, quickCaptureModule, subscriptionModule: subscription });
  });

  afterEach(async () => {
    await db.close();
    jest.restoreAllMocks();
  });

  it.each(UNSUPPORTED)('%s gets one line: what the bot understands and how to write', async (_name, content) => {
    await message(ALLOWED, content);

    expect(replies()).toEqual([{ chat: ALLOWED, text: UNSUPPORTED_ANSWER }]);
    expect(RU.capture.unsupported).toBe(UNSUPPORTED_ANSWER);
    expect(UNSUPPORTED_ANSWER).not.toMatch(EMOJI);
    expect(capture).not.toHaveBeenCalled();
    expect(processVoice).not.toHaveBeenCalled();
  });

  it('a stranger gets nothing for any of them, and no user is made', async () => {
    for (const [, content] of UNSUPPORTED) await message(STRANGER, content);
    await album(STRANGER, 'stranger-album', 3);

    expect(replies()).toEqual([]);
    expect(await usersInDb()).toEqual([]);
  });

  it('an album of 3 — two photos and a video — gets one line, not one an item', async () => {
    await album(ALLOWED, 'album-1', 3);

    expect(replies()).toEqual([{ chat: ALLOWED, text: UNSUPPORTED_ANSWER }]);
  });

  it('an album whose messages are handled side by side, as polling handles a batch, gets one line too', async () => {
    await Promise.all(albumItems('album-1', 3).map(item => message(ALLOWED, item)));

    expect(replies()).toEqual([{ chat: ALLOWED, text: UNSUPPORTED_ANSWER }]);
  });

  it('two albums get two lines', async () => {
    await album(ALLOWED, 'album-1', 3);
    await album(ALLOWED, 'album-2', 2);

    expect(replies()).toEqual([{ chat: ALLOWED, text: UNSUPPORTED_ANSWER }, { chat: ALLOWED, text: UNSUPPORTED_ANSWER }]);
  });

  it('a photo after an album gets its own line', async () => {
    await album(ALLOWED, 'album-1', 3);
    await message(ALLOWED, UNSUPPORTED[0][1]);

    expect(replies()).toHaveLength(2);
  });

  it('a text goes to the capture as before, without the line', async () => {
    await message(ALLOWED, { text: 'кофе 25000' });

    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ text: 'кофе 25000', source: 'telegram' }));
    expect(replies().map(reply => reply.text)).toEqual([RU.capture.notUnderstood]);
  });

  it('a voice goes to the voice pipeline as before, without the line', async () => {
    await message(ALLOWED, { voice: { ...file('v1'), duration: 2 } });

    expect(processVoice).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/nonexistent/voice.ogg', source: 'telegram' }), expect.anything());
    expect(replies().map(reply => reply.text)).toEqual([RU.capture.notUnderstood]);
  });

  // Not a try to write a record (the coordinator's decision): they stay unanswered, as before
  it.each<[string, Record<string, unknown>]>([
    ['a location', { location: { latitude: 41.31, longitude: 69.28 } }],
    ['a contact', { contact: { phone_number: '+998000000000', first_name: 'Test' } }],
    ['a poll', { poll: { id: 'pl1', question: '?', options: [], total_voter_count: 0, is_closed: false, is_anonymous: true, type: 'regular', allows_multiple_answers: false } }],
    ['a dice', { dice: { emoji: '🎲', value: 3 } }],
    ['a service message — writing allowed from the Mini App', { write_access_allowed: { from_request: true } }],
  ])('%s gets no answer', async (_name, content) => {
    await message(ALLOWED, content);

    expect(replies()).toEqual([]);
  });
});
