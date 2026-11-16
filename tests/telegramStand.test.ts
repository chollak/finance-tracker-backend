import 'reflect-metadata';
import { TelegramError } from 'telegraf';
import { REFUSAL, StandModules, TelegramStand } from './helpers/telegramStand';

/**
 * The stand's own chats (#294): what the bot suites rely on when Telegram refuses. A private chat is its person's
 * Telegram id, whether the bot names it by a number or by a string, as the notices do; a chat Telegram does not have
 * with the bot takes nothing; a message is edited only in its own chat.
 */

const PERSON = 597843119;
const STRANGER = 555;

describe('the stand\'s chats (#294)', () => {
  let stand: TelegramStand;

  const refusal = (description: string) => expect.objectContaining({ response: expect.objectContaining({ description }) });

  beforeEach(() => {
    stand = new TelegramStand({ id: PERSON, first_name: 'Shukur' });
    stand.install();
    // No update is delivered here: the bot only has to start
    stand.start({ userModule: {} } as unknown as StandModules);
  });

  afterEach(() => jest.restoreAllMocks());

  it('a blocked chat refuses the bot by either form of its id, until unblocked', async () => {
    stand.block();

    await expect(stand.telegram.sendMessage(PERSON, 'Итоги дня')).rejects.toEqual(refusal(REFUSAL.blocked.description));
    await expect(stand.telegram.sendMessage(String(PERSON), 'Итоги дня')).rejects.toEqual(refusal(REFUSAL.blocked.description));
    expect(stand.botMessages()).toEqual([]);

    stand.unblock(String(PERSON));
    await stand.telegram.sendMessage(String(PERSON), 'Итоги дня');
    expect(stand.botMessages().map(message => message.text)).toEqual(['Итоги дня']);
    expect(stand.sent()).toEqual([expect.objectContaining({ chatId: String(PERSON), text: 'Итоги дня' })]);
  });

  it('a chat Telegram does not have with the bot takes nothing; one whose person started the bot does', async () => {
    await expect(stand.telegram.sendMessage(STRANGER, 'Итоги дня')).rejects.toEqual(refusal(REFUSAL.chatNotFound.description));
    await expect(stand.telegram.sendMessage('@channel', 'Итоги дня')).rejects.toBeInstanceOf(TelegramError);

    stand.chatWith(STRANGER);
    await stand.telegram.sendMessage(String(STRANGER), 'Итоги дня');

    expect(stand.botMessages(STRANGER).map(message => message.text)).toEqual(['Итоги дня']);
    expect(stand.botMessages()).toEqual([]);
  });

  it('a message is edited and deleted only in its own chat', async () => {
    stand.chatWith(STRANGER);
    const { message_id: id } = await stand.telegram.sendMessage(PERSON, 'Записал');

    await expect(stand.telegram.editMessageText(STRANGER, id, undefined, 'Отменено')).rejects.toEqual(refusal(REFUSAL.editedMessageNotFound.description));
    await expect(stand.telegram.deleteMessage(STRANGER, id)).rejects.toBeInstanceOf(TelegramError);
    await stand.telegram.editMessageText(String(PERSON), id, undefined, 'Отменено');

    expect(stand.textOf(id)).toBe('Отменено');
  });

  it('a hung call never returns, and the next start is a process Telegram answers', async () => {
    const reached = stand.hang('sendMessage');
    let returned = false;
    void stand.telegram.sendMessage(PERSON, 'Записал').then(() => { returned = true; });
    await reached;
    await new Promise(resolve => setImmediate(resolve));
    expect(returned).toBe(false);
    expect(stand.botMessages()).toEqual([]);

    stand.start({ userModule: {} } as unknown as StandModules);
    await stand.telegram.sendMessage(PERSON, 'Записал');
    expect(stand.botMessages().map(message => message.text)).toEqual(['Записал']);
  });
});
