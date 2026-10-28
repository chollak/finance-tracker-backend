import { Markup, Telegraf } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import {
  absoluteDate,
  amountDigits,
  amountWithUnit,
  escapeHtml,
  itemName,
  largeRecord,
  quoted,
  recordName,
  RecordMessageInput,
  recordsWord,
  RecordView,
  selectedRecord,
  signedAmount,
  thousandTimesLess,
} from '../formatters/recordMessage';
import { accountsFor, RECORD_CALLBACK_PATTERN, RECORD_VERBS, recordCallback } from '../keyboards/recordKeyboard';
import {
  assumedThousands,
  botMessageLog,
  cancelRecords,
  chatIdOf,
  closeOtherQuestions,
  closeQuestion,
  closedQuestion,
  editPlainMessage,
  guessedIds,
  readRecord,
  recordMessageInput,
  redrawRecordMessage,
  restoreRecords,
  sendRecordMessage,
} from '../utils/recordMessageView';
import { AmountReply, parseAmountCorrection, parseAmountReply, writtenAmountMatches } from '../utils/amountReply';
import { botUserId } from '../utils/userCategories';
import { withMessageClientId } from '../utils/messageClientId';
import { checkTelegramLimit } from '../middleware/subscriptionMiddleware';
import { BotMessage, openQuestion, RecordMessageMode, RecordMessageState } from '../../../../modules/botMessage/domain/botMessage';
import { BotMessageLog } from '../../../../modules/botMessage/application/botMessageLog';
import { ResolvedAccount } from '../../../../modules/transaction/domain/accountResolver';
import { isValidDateOnly } from '../../../../shared/domain/dates/dateOnly';
import { MINOR_PER_MAJOR } from '../../../../shared/domain/money/money';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * The buttons under a record message and /undo (FT-122, docs/pastel/design-system.md «Бот в Telegram»):
 * «Изменить» → a field in two presses, «Отменить» strikes the record through with «Вернуть», /undo does
 * the same for the last record of the chat. Every press reads the message from `bot_messages`, changes
 * the records through the transaction use cases and draws the message again.
 */
export function registerRecordHandlers(bot: Telegraf<BotContext>) {
  bot.command('undo', handleUndo);
  bot.action(RECORD_CALLBACK_PATTERN, handleRecordPress);
  // Buttons of confirmations sent before FT-122: the message is taken over by the new flow
  bot.action(/^(edit|delete|confirm):(.+)$/, handleEarlierButton);
}

const FIELD_MODES: readonly RecordMessageMode[] = ['amount', 'category', 'account', 'date'];

/** What a press leaves: the keyboard screen and the state to store. */
interface PressResult {
  mode: RecordMessageMode;
  state: RecordMessageState;
}

class PressFailed extends Error {}

function withoutPick(state: RecordMessageState): RecordMessageState {
  const { pickType: _pickType, back: _back, ...rest } = state;
  return rest;
}

function confirmed(state: RecordMessageState, changed?: string): PressResult {
  const next = withoutPick(state);
  if (changed) next.changed = changed;
  else delete next.changed;
  return { mode: 'confirm', state: next };
}

function callbackMessage(ctx: BotContext): { chatId: string; messageId: number } | undefined {
  const message = ctx.callbackQuery?.message;
  if (!message) return undefined;
  return { chatId: String(message.chat.id), messageId: message.message_id };
}

async function answer(ctx: BotContext, text?: string): Promise<void> {
  try {
    await ctx.answerCbQuery(text);
  } catch {
    // The spinner on the button times out by itself
  }
}

/** The stored message under the pressed button, if it is the presser's. */
async function pressedMessage(ctx: BotContext, log: BotMessageLog, userId: string): Promise<BotMessage | null> {
  const where = callbackMessage(ctx);
  if (!where) return null;
  const message = await log.find(where.chatId, where.messageId);
  return message && message.userId === userId ? message : null;
}

async function update(ctx: BotContext, id: string, changes: Record<string, unknown>): Promise<void> {
  const result = await ctx.modules.transactionModule.getUpdateTransactionUseCase().execute({ id, ...changes });
  if (!result.success) throw new PressFailed(result.error.message);
}

/** «Вернул запись.» under the /undo reply once its records are back. */
async function closeUndoReply(ctx: BotContext, message: BotMessage, count: number): Promise<void> {
  if (message.state.undoMessageId === undefined) return;
  await editPlainMessage(ctx, message.chatId, message.state.undoMessageId, RU.record.reverted(count));
}

/**
 * «Вернуть»: the one record named, or the records of the message — after /undo only the ones it
 * cancelled, as on the board. A stale button on records already back changes nothing and says nothing.
 */
async function revert(ctx: BotContext, message: BotMessage, input: RecordMessageInput, index?: number): Promise<PressResult> {
  if (index !== undefined) {
    const one = input.records[index];
    if (!one) throw new PressFailed('No such record');
    if (!one.cancelled) return confirmed(message.state);
    await restoreRecords(ctx, [one]);
    return confirmed(message.state, `${quoted(recordName(one))} возвращена`);
  }
  const { undone } = message.state;
  const cancelled = input.records.filter(record => record.cancelled && (!undone?.length || undone.includes(record.id)));
  await restoreRecords(ctx, cancelled);
  await closeUndoReply(ctx, message, cancelled.length);
  const state = { ...message.state };
  delete state.undoMessageId;
  delete state.undone;
  if (cancelled.length === 0) return confirmed(state);
  return confirmed(state, cancelled.length > 1 ? 'Записи возвращены' : 'Запись возвращена');
}

/**
 * The record a large-amount button is about, while its question is open: the message is on the `large`
 * screen and the record is still held (deleted softly). After «Это 25 000 сум», «Да, верная», «Не записывать»
 * or a typed amount it is not: a second tap, or a keyboard drawn before, must not change the record again.
 */
function heldLarge(message: BotMessage, input: RecordMessageInput): RecordView | undefined {
  if (message.mode !== 'large') return undefined;
  const big = largeRecord(input);
  return big?.cancelled ? big : undefined;
}

/**
 * Applies a press to the message: the records change, the screen changes. Null when the press is about a
 * question no longer asked — a double tap, a stale keyboard: nothing changes, the message is drawn as it is.
 */
async function applyPress(
  ctx: BotContext,
  log: BotMessageLog,
  message: BotMessage,
  input: RecordMessageInput,
  verb: string,
  arg: string | undefined
): Promise<PressResult | null> {
  const { state } = message;
  const record = selectedRecord(input);
  const live = input.records.filter(candidate => !candidate.cancelled);

  switch (verb) {
    case RECORD_VERBS.edit: {
      const first = input.records.findIndex(candidate => !candidate.cancelled);
      if (first === -1) return confirmed(state);
      const next = withoutPick({ ...state, selected: first });
      delete next.changed;
      return { mode: 'edit', state: next };
    }
    case RECORD_VERBS.pick: {
      const index = Number(arg);
      if (!Number.isInteger(index) || !input.records[index]) throw new PressFailed('No such record');
      // Cancelled meanwhile, in the app: the message is drawn again, the button turns into «Вернуть»
      if (input.records[index].cancelled) return confirmed(state);
      const next = withoutPick({ ...state, selected: index });
      delete next.changed;
      return { mode: 'edit', state: next };
    }
    case RECORD_VERBS.field: {
      const mode = FIELD_MODES.find(candidate => candidate === arg);
      if (!mode) throw new PressFailed(`Unknown field ${arg}`);
      if (mode === 'amount') await closeOtherQuestions(ctx, log, message);
      return { mode, state: withoutPick(state) };
    }
    case RECORD_VERBS.back:
      // From the categories opened by «Другая», back to the question it came from (FT-123)
      return { mode: state.back === 'confirm' ? 'confirm' : 'edit', state: withoutPick(state) };
    case RECORD_VERBS.done:
      return confirmed(state, state.changed);
    case RECORD_VERBS.switchType: {
      if (!record) throw new PressFailed('No record');
      const shown = state.pickType ?? record.type;
      const next = withoutPick(state);
      if (state.back) next.back = state.back;
      const other = shown === 'income' ? 'expense' : 'income';
      if (other !== record.type) next.pickType = other;
      return { mode: 'category', state: next };
    }
    case RECORD_VERBS.category: {
      if (!record) throw new PressFailed('No record');
      const type = state.pickType ?? record.type;
      const category = input.categories.find(candidate => candidate.id === arg && candidate.type === type);
      if (!category) throw new PressFailed('Category not offered');
      const switched = type !== record.type;
      await update(ctx, record.id, switched ? { categoryId: category.id, type, semanticType: type } : { categoryId: category.id });
      const next = { ...state, guessed: state.guessed.filter(id => id !== record.id) };
      const changed = `${switched ? `Теперь это ${type === 'income' ? 'доход' : 'расход'}. ` : ''}Категория: ${category.name}`;
      return confirmed(next, changed);
    }
    case RECORD_VERBS.account: {
      if (!record) throw new PressFailed('No record');
      const account = accountsFor(record, input.accounts).find(candidate => candidate.id === arg);
      if (!account) throw new PressFailed('Account not offered');
      await update(ctx, record.id, { accountId: account.id });
      return confirmed(state, `Счёт: ${account.name}`);
    }
    case RECORD_VERBS.date: {
      if (!record || !isValidDateOnly(arg)) throw new PressFailed('Not a date');
      await update(ctx, record.id, { date: arg });
      return confirmed(state, `Дата: ${absoluteDate(arg, input.today)}`);
    }
    case RECORD_VERBS.cancel: {
      // In «Изменить» of one of several records only that record goes; otherwise all of the message
      if (input.records.length > 1 && message.mode !== 'confirm' && record && !record.cancelled) {
        await cancelRecords(ctx, [record]);
        return confirmed(state, `${quoted(recordName(record))} отменена`);
      }
      await cancelRecords(ctx, live);
      // Nothing of the message is left: what had no amount is not asked any more (FT-123)
      const next = closedQuestion({ ...message, state }).state;
      delete next.undone; // «Вернуть» now brings back all of them
      return confirmed(next);
    }
    case RECORD_VERBS.revert:
      return revert(ctx, message, input, arg === undefined ? undefined : Number(arg));
    case RECORD_VERBS.rightCategory: {
      if (!record) throw new PressFailed('No record');
      const next = { ...state, guessed: state.guessed.filter(id => id !== record.id) };
      return confirmed(next, `Категория: ${record.categoryName}`);
    }
    case RECORD_VERBS.otherCategory:
      return { mode: 'category', state: { ...withoutPick(state), selected: 0, back: 'confirm' } };
    case RECORD_VERBS.skip: {
      // The button says how many items were still asked when it was drawn: the list only gets shorter from
      // the front, so another count means its item was already skipped, answered or closed
      const [item, ...rest] = state.missing ?? [];
      if (!item || Number(arg) !== rest.length + 1) return null;
      const next: RecordMessageState = { ...state, notes: [...(state.notes ?? []), RU.record.skipped(quoted(itemName(item)))] };
      if (rest.length) next.missing = rest;
      else delete next.missing;
      return { mode: message.mode, state: next };
    }
    case RECORD_VERBS.largeRight:
      return heldLarge(message, input) ? releaseLarge(ctx, message, input) : null;
    case RECORD_VERBS.largeFix: {
      const big = heldLarge(message, input);
      if (!big) return null;
      // Brought back first: a deleted record cannot be changed
      const released = await releaseLarge(ctx, message, input, `Сумма изменена: было ${amountDigits(big.amountMinor, big.currency)}`);
      await update(ctx, big.id, { amountMinor: thousandTimesLess(big) });
      return released;
    }
    case RECORD_VERBS.largeDecline: {
      const big = heldLarge(message, input);
      return big ? declineLarge(ctx, message, input, big) : null;
    }
    default:
      throw new PressFailed(`Unknown action ${verb}`);
  }
}

/**
 * Closes the chat's open question, if it is this person's, so that a later number does not change a record
 * or write an item (design-system «Один вопрос за раз»). Text and voice that are not an amount close it in
 * answerAmountQuestion; a command, here.
 */
async function closeOpenQuestion(ctx: BotContext): Promise<void> {
  const log = botMessageLog(ctx);
  const chatId = chatIdOf(ctx);
  if (!log || !chatId) return;
  const message = await log.awaitingAmount(chatId);
  if (!message || message.userId !== await botUserId(ctx)) return;
  await closeQuestion(ctx, log, message);
}

/** Ahead of the command handlers: a command closes the open question first. */
export async function closeAmountQuestionOnCommand(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (text.startsWith('/')) {
    try {
      await closeOpenQuestion(ctx);
    } catch (error) {
      logger.warn('Could not close the open question before a command', { error: (error as Error).message });
    }
  }
  return next();
}

/**
 * «Да, верная», «Это 25 000 сум» or the right amount typed (FT-123): the records held for the large amount
 * come back — all but one the person declined — and the message is a confirmation again.
 */
async function releaseLarge(ctx: BotContext, message: BotMessage, input: RecordMessageInput, changed?: string): Promise<PressResult> {
  await restoreRecords(ctx, input.records.filter(record => record.cancelled));
  const next = { ...message.state, selected: 0 };
  delete next.large;
  return confirmed(next, changed);
}

/**
 * «Не записывать» of a large amount (FT-123): it stays deleted and leaves the message; the other records of
 * the phrase are written.
 */
async function declineLarge(ctx: BotContext, message: BotMessage, input: RecordMessageInput, big: RecordView): Promise<PressResult> {
  await restoreRecords(ctx, input.records.filter(record => record.cancelled && record.id !== big.id));
  const next: RecordMessageState = { ...message.state, selected: 0, declined: [...(message.state.declined ?? []), big.id] };
  delete next.large;
  return confirmed(next);
}

/**
 * A screen of one record («Изменить» or one of its fields) whose record was cancelled meanwhile — in the
 * app, or by /undo of another message. The press would change a cancelled record, so it only draws the
 * message again: struck through, with «Вернуть».
 */
function isStaleScreen(message: BotMessage, input: RecordMessageInput, verb: string): boolean {
  // The records of a large amount are held deleted on purpose until it is answered (FT-123)
  if (message.mode === 'large') return false;
  return message.mode !== 'confirm' && verb !== RECORD_VERBS.revert && Boolean(selectedRecord(input)?.cancelled);
}

/** Runs a press on a stored message and draws the message again. */
async function pressMessage(ctx: BotContext, log: BotMessageLog, message: BotMessage, verb: string, arg?: string): Promise<void> {
  const input = await recordMessageInput(ctx, message);
  // Its records gone altogether. A message of only an item without an amount has none, but its «Не
  // записывать» works; a declined large amount is still drawn (FT-123)
  if (input.records.length === 0 && !input.declined?.length && message.recordIds.length > 0) {
    await answer(ctx, RU.record.notFound);
    return;
  }
  const result = isStaleScreen(message, input, verb) ? confirmed(message.state) : await applyPress(ctx, log, message, input, verb, arg);
  // A press about a question no longer asked is not saved: the message is drawn as it is now
  await redrawRecordMessage(ctx, result ? await log.save(message, result) : message);
  await answer(ctx);
}

async function handleRecordPress(ctx: BotContext) {
  const match = (ctx as BotContext & { match?: RegExpExecArray }).match;
  const verb = match?.[1] ?? '';
  const arg = match?.[2];
  const log = botMessageLog(ctx);
  try {
    if (!log) {
      await answer(ctx, RU.record.notFound);
      return;
    }
    const userId = await botUserId(ctx);
    if (verb === RECORD_VERBS.undoRevert) {
      await revertFromUndoReply(ctx, log, userId, Number(arg));
      return;
    }
    const message = await pressedMessage(ctx, log, userId);
    if (!message) {
      await answer(ctx, RU.record.notFound);
      return;
    }
    await pressMessage(ctx, log, message, verb, arg);
  } catch (error) {
    logger.error('Record button failed', error as Error, { userId: ctx.from?.id, verb, arg });
    await answer(ctx, RU.errors.generic);
  }
}

/**
 * «Изменить», «Удалить», «Подтвердить» under a confirmation sent before FT-122: the message is
 * remembered now and redrawn the new way — «Удалить» cancels with «Вернуть».
 */
async function handleEarlierButton(ctx: BotContext) {
  const match = (ctx as BotContext & { match?: RegExpExecArray }).match;
  const action = match?.[1];
  const recordId = match?.[2] ?? '';
  const log = botMessageLog(ctx);
  const where = callbackMessage(ctx);
  try {
    const userId = await botUserId(ctx);
    const record = await readRecord(ctx, recordId);
    if (!log || !where || !record || record.userId !== userId) {
      await answer(ctx, RU.record.notFound);
      return;
    }
    const message = await log.find(where.chatId, where.messageId)
      ?? await log.remember({ userId, chatId: where.chatId, messageId: where.messageId, recordIds: [recordId] });
    if (message.userId !== userId) {
      await answer(ctx, RU.record.notFound);
      return;
    }
    const verb = action === 'edit' ? RECORD_VERBS.edit : action === 'delete' ? RECORD_VERBS.cancel : RECORD_VERBS.done;
    await pressMessage(ctx, log, message, verb);
  } catch (error) {
    logger.error('Earlier record button failed', error as Error, { userId: ctx.from?.id, action, recordId });
    await answer(ctx, RU.errors.generic);
  }
}

function undoKeyboard(targetMessageId: number): InlineKeyboardButton[][] {
  return [[Markup.button.callback('Вернуть', recordCallback(RECORD_VERBS.undoRevert, targetMessageId))]];
}

/**
 * /undo: the records of the chat's last message that still has any are cancelled — struck through
 * there with «Вернуть» — and the reply says what was cancelled, with «Вернуть» of its own.
 */
async function handleUndo(ctx: BotContext) {
  const log = botMessageLog(ctx);
  const chatId = chatIdOf(ctx);
  try {
    const userId = await botUserId(ctx);
    if (!log || !chatId) {
      await ctx.reply(RU.record.nothingToUndo);
      return;
    }

    for (const message of await log.recent(chatId)) {
      if (message.userId !== userId) continue;
      const input = await recordMessageInput(ctx, message);
      const live = input.records.filter(record => !record.cancelled);
      if (live.length === 0) continue;

      await cancelRecords(ctx, live);
      const what = live.length === 1 ? `${signedAmount(live[0])} · ${quoted(recordName(live[0]))}` : recordsWord(live.length);
      const reply = await ctx.reply(escapeHtml(RU.record.undone(what)), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: undoKeyboard(message.messageId) },
      });
      const state = withoutPick({ ...message.state, undone: live.map(record => record.id) });
      delete state.changed;
      if (reply?.message_id) state.undoMessageId = reply.message_id;
      await redrawRecordMessage(ctx, await log.save(message, { mode: 'confirm', state }));
      return;
    }

    await ctx.reply(RU.record.nothingToUndo);
  } catch (error) {
    logger.error('/undo failed', error as Error, { userId: ctx.from?.id });
    await ctx.reply(RU.errors.generic);
  }
}

/** «Вернуть» under the /undo reply: the records come back and the reply says so. */
async function revertFromUndoReply(ctx: BotContext, log: BotMessageLog, userId: string, targetMessageId: number): Promise<void> {
  const where = callbackMessage(ctx);
  const target = where && Number.isInteger(targetMessageId) ? await log.find(where.chatId, targetMessageId) : null;
  if (!where || !target || target.userId !== userId) {
    await answer(ctx, RU.record.notFound);
    return;
  }
  const input = await recordMessageInput(ctx, target);
  if (input.records.length === 0) {
    await answer(ctx, RU.record.notFound);
    return;
  }
  const result = await revert(ctx, { ...target, state: { ...target.state, undoMessageId: where.messageId } }, input);
  await redrawRecordMessage(ctx, await log.save(target, result));
  await answer(ctx);
}

type AmountOf = Extract<AmountReply, { kind: 'amount' }>;

/**
 * A new amount for a record of a message — the answer to «Сумму», to a large amount, «не 25, а 28». The
 * record moves to an account in the new currency, «нал» moves it to cash; the message says what it was and a
 * held large amount is written; the bot says what changed. Nothing changes when there is no account in the
 * new currency: the bot says so.
 */
async function changeAmount(
  ctx: BotContext,
  log: BotMessageLog,
  target: { message: BotMessage; input: RecordMessageInput; record: RecordView },
  reply: AmountOf,
  userId: string,
  sayAssumed = true
): Promise<void> {
  const { message, input, record } = target;
  const changes: Record<string, unknown> = { amountMinor: reply.amountMinor };
  if (reply.currency !== record.currency) {
    // Money does not change currency in place: the record moves to an account in the new currency
    const account = await accountFor(ctx, userId, reply.currency, reply.account);
    if (!account) {
      await ctx.reply(RU.record.noAccountIn(reply.currency));
      return;
    }
    changes.accountId = account.id;
    changes.currency = reply.currency;
  } else if (reply.account) {
    // «18к нал»: the record moves to a cash account of its currency, if the person has one
    const account = await accountFor(ctx, userId, reply.currency, reply.account);
    if (account?.matchedBy === 'kind' && account.id !== record.accountId) changes.accountId = account.id;
  }

  const was = reply.currency === record.currency && record.currency === 'UZS'
    ? amountDigits(record.amountMinor, record.currency)
    : amountWithUnit(record.amountMinor, record.currency);
  const changed = `Сумма изменена: было ${was}`;
  // The right amount of a large one: the records held for it are written — brought back first, since a
  // deleted record cannot be changed (FT-123)
  const result = message.mode === 'large' ? await releaseLarge(ctx, message, input, changed) : confirmed(message.state, changed);
  await update(ctx, record.id, changes);
  await redrawRecordMessage(ctx, await log.save(message, result));

  const view: RecordView = { ...record, amountMinor: reply.amountMinor, currency: reply.currency };
  const assumed = reply.written && sayAssumed ? `. ${quoted(reply.written)} понял как ${amountWithUnit(reply.amountMinor, reply.currency)}` : '';
  await ctx.reply(escapeHtml(RU.record.changed(`${signedAmount(view)} · ${quoted(recordName(view))}${assumed}`)), { parse_mode: 'HTML' });
}

/** The amount answer to a question about one record: «Сумму» or a large amount. False when the text is not an amount. */
async function answerWithAmount(
  ctx: BotContext,
  log: BotMessageLog,
  target: { message: BotMessage; input: RecordMessageInput; record: RecordView },
  text: string,
  userId: string
): Promise<boolean> {
  const reply = parseAmountReply(text, target.record);
  if (!reply) {
    await closeQuestion(ctx, log, target.message);
    return false;
  }
  if (reply.kind === 'not_positive') {
    await ctx.reply(RU.record.amountNotPositive);
    return true;
  }
  if (reply.kind === 'too_big') {
    await ctx.reply(RU.record.amountTooBig);
    return true;
  }
  await changeAmount(ctx, log, target, reply, userId);
  return true;
}

function userNameOf(ctx: BotContext): string {
  return `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';
}

/**
 * The answer to «Сколько?» (FT-123): the first item named without an amount is written with it — through
 * the capture pipeline, so its guesses read as a phrase's — and confirmed in a message of its own, which asks
 * about the next item if there is one. The asking message says the item was written separately.
 */
async function answerMissing(ctx: BotContext, log: BotMessageLog, message: BotMessage, text: string, userId: string): Promise<boolean> {
  const [item, ...rest] = message.state.missing ?? [];
  if (!item) return false;
  const reply = parseAmountReply(text, { currency: 'UZS' });
  if (!reply) {
    await closeQuestion(ctx, log, message);
    return false;
  }
  if (reply.kind === 'not_positive') {
    await ctx.reply(RU.record.amountNotPositive);
    return true;
  }
  if (reply.kind === 'too_big') {
    await ctx.reply(RU.record.amountTooBig);
    return true;
  }
  // Unlike «Сумму», this answer adds a record: the free limit meets it as it meets a phrase, and the
  // question stays open
  const { subscriptionModule } = ctx.modules;
  if (subscriptionModule && !await checkTelegramLimit(ctx, subscriptionModule, userId, 'transactions')) return true;

  const captured = await ctx.modules.quickCaptureModule.getQuickCaptureService().captureWithAmount({
    item,
    answer: { text: text.trim(), amount: reply.amountMinor / MINOR_PER_MAJOR, currency: reply.currency, kind: reply.account },
    userId,
    userName: userNameOf(ctx),
    source: 'telegram',
    // The answer sent again after a restart writes nothing (FT-167)
    ...withMessageClientId(ctx),
  });
  if (captured.transactions.length === 0) {
    // Nothing written: the question stays open
    await ctx.reply(RU.errors.generic);
    return true;
  }

  const state: RecordMessageState = { ...message.state, notes: [...(message.state.notes ?? []), RU.record.writtenSeparately(quoted(itemName(item)))] };
  delete state.missing;
  await redrawRecordMessage(ctx, await log.save(message, { state }));
  await sendRecordMessage(ctx, {
    userId,
    recordIds: captured.transactions.map(transaction => transaction.id),
    guessed: guessedIds(captured.transactions),
    assumed: assumedThousands(captured.transactions),
    missing: rest,
  });
  return true;
}

function repliedMessageId(ctx: BotContext): number | undefined {
  const message = ctx.message as { reply_to_message?: { message_id?: number } } | undefined;
  return message?.reply_to_message?.message_id;
}

interface CorrectionTarget {
  message: BotMessage;
  input: RecordMessageInput;
  record: RecordView;
}

/**
 * The record «не 25, а 28» is about: of the bot message it replies to; else the one the open «Сумму» or
 * large-amount question asks about, if «25» is its amount or not given; else the chat's newest record of
 * that amount.
 */
async function correctionTarget(ctx: BotContext, log: BotMessageLog, chatId: string, userId: string, was: string): Promise<CorrectionTarget | null> {
  const wasGiven = /\d/.test(was);
  const isWas = (record: RecordView) => writtenAmountMatches(was, record);

  const repliedTo = repliedMessageId(ctx);
  const replied = repliedTo === undefined ? null : await log.find(chatId, repliedTo);
  if (replied && replied.userId === userId) {
    const input = await recordMessageInput(ctx, replied);
    const live = input.records.filter(record => !record.cancelled);
    let record: RecordView | undefined;
    if (replied.mode === 'large') record = largeOf(input, wasGiven ? isWas : undefined);
    else if (wasGiven) record = live.find(isWas);
    else record = replied.mode === 'amount' ? selectedRecord(input) : live.length === 1 ? live[0] : undefined;
    return record ? { message: replied, input, record } : null;
  }

  const asking = await log.awaitingAmount(chatId);
  if (asking && asking.userId === userId && (asking.mode === 'amount' || asking.mode === 'large')) {
    const input = await recordMessageInput(ctx, asking);
    const record = asking.mode === 'large' ? largeRecord(input) : selectedRecord(input);
    if (record && (!wasGiven || isWas(record))) return { message: asking, input, record };
  }

  if (!wasGiven) return null;
  for (const message of await log.recent(chatId)) {
    if (message.userId !== userId) continue;
    const input = await recordMessageInput(ctx, message);
    // A held large amount is deleted on purpose: its record is the one to match there
    const record = message.mode === 'large' ? largeOf(input, isWas) : input.records.find(candidate => !candidate.cancelled && isWas(candidate));
    if (record) return { message, input, record };
  }
  return null;
}

/** The record of a large-amount question, if «25» of «не 25, а 28» (when given) is its amount. */
function largeOf(input: RecordMessageInput, isWas?: (record: RecordView) => boolean): RecordView | undefined {
  const record = largeRecord(input);
  return record && (!isWas || isWas(record)) ? record : undefined;
}

/**
 * «не 25, а 28» (FT-123, design-system «До любого поля — 2 нажатия»): the amount of a record changes, as
 * after «Сумму». True when the text was such a correction — answered even when it cannot be applied.
 */
async function correctAmount(ctx: BotContext, log: BotMessageLog, chatId: string, text: string, userId: string): Promise<boolean> {
  const correction = parseAmountCorrection(text);
  if (!correction) return false;
  const wasGiven = /\d/.test(correction.was);
  if (!wasGiven && !/\d/.test(correction.now)) {
    await ctx.reply(RU.record.correctionOnlyAmount);
    return true;
  }
  // «не обед, а ужин 45к» is a phrase, not a correction
  if (!wasGiven && !parseAmountReply(correction.now, { currency: 'UZS' })) return false;

  const target = await correctionTarget(ctx, log, chatId, userId, correction.was);
  if (!target) {
    await ctx.reply(wasGiven ? RU.record.correctionNotFound(correction.was) : RU.record.correctionWhich);
    return true;
  }
  const reply = parseAmountReply(correction.now, target.record);
  if (!reply || reply.kind === 'not_positive') {
    await ctx.reply(RU.record.correctionNotAnAmount);
    return true;
  }
  if (reply.kind === 'too_big') {
    await ctx.reply(RU.record.amountTooBig);
    return true;
  }

  // «28» in «не 25, а 28» is read the way «25» was written: no need to say it is 28 000
  const wasShortened = parseAmountReply(correction.was, target.record);
  await changeAmount(ctx, log, target, reply, userId, !(wasShortened?.kind === 'amount' && wasShortened.written));
  // Another text for a question elsewhere: «Сумму» or a large amount there closes; «Сколько?» stays asked
  for (const other of await log.otherQuestions(target.message)) {
    if (openQuestion(other.mode, other.state) !== 'missing') await closeQuestion(ctx, log, other);
  }
  return true;
}

/**
 * A text, or the words of a voice message (FT-122, FT-123). «не 25, а 28» changes the amount of a record.
 * Otherwise, where a message waits for an amount — after «Сумму», «Сколько?» of an item named without one, a
 * large amount — an amount (with an account word, «18к нал», if any) answers it; anything else closes the
 * question honestly and the text is handled as usual. True when the text was handled here.
 */
export async function answerAmountQuestion(ctx: BotContext, text: string, userId: string): Promise<boolean> {
  const log = botMessageLog(ctx);
  const chatId = chatIdOf(ctx);
  if (!log || !chatId) return false;
  if (await correctAmount(ctx, log, chatId, text, userId)) return true;

  const message = await log.awaitingAmount(chatId);
  if (!message || message.userId !== userId) return false;

  if (openQuestion(message.mode, message.state) === 'missing') return answerMissing(ctx, log, message, text, userId);

  const input = await recordMessageInput(ctx, message);
  const record = message.mode === 'large' ? largeRecord(input) : selectedRecord(input);
  if (!record || (message.mode !== 'large' && record.cancelled)) {
    await closeQuestion(ctx, log, message, true);
    return false;
  }
  return answerWithAmount(ctx, log, { message, input, record }, text, userId);
}

/**
 * The account a record in this currency goes to: of the kind named if there is one, else the default
 * one if it fits, else the first visible; undefined when the person has no account in that currency.
 */
async function accountFor(ctx: BotContext, userId: string, currency: 'UZS' | 'USD', kind?: 'cash' | 'card'): Promise<ResolvedAccount | undefined> {
  const book = ctx.modules.accountModule?.getBook();
  if (!book) return undefined;
  const resolved = await book.resolveForRecord({ userId, currency, kind });
  return resolved.success && resolved.data.currency === currency ? resolved.data : undefined;
}
