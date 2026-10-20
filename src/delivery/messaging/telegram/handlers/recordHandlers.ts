import { Markup, Telegraf } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import {
  absoluteDate,
  amountDigits,
  amountWithUnit,
  escapeHtml,
  quoted,
  recordName,
  RecordMessageInput,
  recordsWord,
  RecordView,
  selectedRecord,
  signedAmount,
} from '../formatters/recordMessage';
import { accountsFor, RECORD_CALLBACK_PATTERN, RECORD_VERBS, recordCallback } from '../keyboards/recordKeyboard';
import {
  botMessageLog,
  chatIdOf,
  editPlainMessage,
  readRecord,
  recordMessageInput,
  redrawRecordMessage,
} from '../utils/recordMessageView';
import { parseAmountReply } from '../utils/amountReply';
import { botUserId } from '../utils/userCategories';
import { BotMessage, RecordMessageMode, RecordMessageState } from '../../../../modules/botMessage/domain/botMessage';
import { BotMessageLog } from '../../../../modules/botMessage/application/botMessageLog';
import { ResolvedAccount } from '../../../../modules/transaction/domain/accountResolver';
import { isValidDateOnly } from '../../../../shared/domain/dates/dateOnly';
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
  const { pickType: _pickType, ...rest } = state;
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

async function cancel(ctx: BotContext, records: RecordView[]): Promise<void> {
  for (const record of records) {
    const result = await ctx.modules.transactionModule.getDeleteTransactionUseCase().execute({ id: record.id });
    if (!result.success) throw new PressFailed(result.error.message);
  }
}

async function restore(ctx: BotContext, records: RecordView[]): Promise<void> {
  for (const record of records) {
    const result = await ctx.modules.transactionModule.getRestoreTransactionUseCase().execute({ id: record.id });
    if (!result.success) throw new PressFailed(result.error.message);
  }
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
    await restore(ctx, [one]);
    return confirmed(message.state, `${quoted(recordName(one))} возвращена`);
  }
  const { undone } = message.state;
  const cancelled = input.records.filter(record => record.cancelled && (!undone?.length || undone.includes(record.id)));
  await restore(ctx, cancelled);
  await closeUndoReply(ctx, message, cancelled.length);
  const state = { ...message.state };
  delete state.undoMessageId;
  delete state.undone;
  if (cancelled.length === 0) return confirmed(state);
  return confirmed(state, cancelled.length > 1 ? 'Записи возвращены' : 'Запись возвращена');
}

/** Applies a press to the message: the records change, the screen changes. */
async function applyPress(
  ctx: BotContext,
  log: BotMessageLog,
  message: BotMessage,
  input: RecordMessageInput,
  verb: string,
  arg: string | undefined
): Promise<PressResult> {
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
      if (mode === 'amount') await closeOtherAmountQuestions(ctx, log, message);
      return { mode, state: withoutPick(state) };
    }
    case RECORD_VERBS.back:
      return { mode: 'edit', state: withoutPick(state) };
    case RECORD_VERBS.done:
      return confirmed(state, state.changed);
    case RECORD_VERBS.switchType: {
      if (!record) throw new PressFailed('No record');
      const shown = state.pickType ?? record.type;
      const next = withoutPick(state);
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
        await cancel(ctx, [record]);
        return confirmed(state, `${quoted(recordName(record))} отменена`);
      }
      await cancel(ctx, live);
      const next = { ...state };
      delete next.undone; // «Вернуть» now brings back all of them
      return confirmed(next);
    }
    case RECORD_VERBS.revert:
      return revert(ctx, message, input, arg === undefined ? undefined : Number(arg));
    default:
      throw new PressFailed(`Unknown action ${verb}`);
  }
}

/**
 * Closes a message's «Сумму» question: back on «Изменить», or on the confirmation when its record is
 * gone. The log keeps the change even if the message cannot be drawn again.
 */
async function closeQuestion(ctx: BotContext, log: BotMessageLog, message: BotMessage, mode: RecordMessageMode = 'edit'): Promise<void> {
  const closed = await log.save(message, { mode });
  try {
    await redrawRecordMessage(ctx, closed);
  } catch (error) {
    // An old message that cannot be drawn keeps its old buttons
    logger.warn('Could not redraw a closed amount question', { messageId: message.messageId, error: (error as Error).message });
  }
}

/** One question at a time: a new «Сумму» puts any other message waiting for an amount back on «Изменить». */
async function closeOtherAmountQuestions(ctx: BotContext, log: BotMessageLog, message: BotMessage): Promise<void> {
  for (const other of await log.otherAmountQuestions(message)) await closeQuestion(ctx, log, other);
}

/**
 * Closes the chat's open «Сумму» question, if it is this person's, so that a later number does not
 * change that record (design-system «Один вопрос за раз»). Text and voice that are not an amount close it
 * in answerAmountQuestion; a command, here.
 */
async function closeAmountQuestion(ctx: BotContext): Promise<void> {
  const log = botMessageLog(ctx);
  const chatId = chatIdOf(ctx);
  if (!log || !chatId) return;
  const message = await log.awaitingAmount(chatId);
  if (!message || message.userId !== await botUserId(ctx)) return;
  await closeQuestion(ctx, log, message);
}

/** Ahead of the command handlers: a command closes the open «Сумму» question first. */
export async function closeAmountQuestionOnCommand(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (text.startsWith('/')) {
    try {
      await closeAmountQuestion(ctx);
    } catch (error) {
      logger.warn('Could not close the amount question before a command', { error: (error as Error).message });
    }
  }
  return next();
}

/**
 * A screen of one record («Изменить» or one of its fields) whose record was cancelled meanwhile — in the
 * app, or by /undo of another message. The press would change a cancelled record, so it only draws the
 * message again: struck through, with «Вернуть».
 */
function isStaleScreen(message: BotMessage, input: RecordMessageInput, verb: string): boolean {
  return message.mode !== 'confirm' && verb !== RECORD_VERBS.revert && Boolean(selectedRecord(input)?.cancelled);
}

/** Runs a press on a stored message and draws the message again. */
async function pressMessage(ctx: BotContext, log: BotMessageLog, message: BotMessage, verb: string, arg?: string): Promise<void> {
  const input = await recordMessageInput(ctx, message);
  if (input.records.length === 0) {
    await answer(ctx, RU.record.notFound);
    return;
  }
  const result = isStaleScreen(message, input, verb) ? confirmed(message.state) : await applyPress(ctx, log, message, input, verb, arg);
  const saved = await log.save(message, result);
  await redrawRecordMessage(ctx, saved);
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

      await cancel(ctx, live);
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

/**
 * A text, or the words of a voice message, in a chat where a message waits for an amount after «Сумму».
 * An amount (with an account word, «18к нал», if any) changes the record and the bot says so; anything
 * else closes the question honestly — the message goes back to «Изменить» — and the text is handled as
 * usual. True when the text was the answer.
 */
export async function answerAmountQuestion(ctx: BotContext, text: string, userId: string): Promise<boolean> {
  const log = botMessageLog(ctx);
  const chatId = chatIdOf(ctx);
  if (!log || !chatId) return false;
  const message = await log.awaitingAmount(chatId);
  if (!message || message.userId !== userId) return false;

  const input = await recordMessageInput(ctx, message);
  const record = selectedRecord(input);
  if (!record || record.cancelled) {
    await closeQuestion(ctx, log, message, 'confirm');
    return false;
  }

  const reply = parseAmountReply(text, record);
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

  const changes: Record<string, unknown> = { amountMinor: reply.amountMinor };
  if (reply.currency !== record.currency) {
    // Money does not change currency in place: the record moves to an account in the new currency
    const account = await accountFor(ctx, userId, reply.currency, reply.account);
    if (!account) {
      await ctx.reply(RU.record.noAccountIn(reply.currency));
      return true;
    }
    changes.accountId = account.id;
    changes.currency = reply.currency;
  } else if (reply.account) {
    // «18к нал»: the record moves to a cash account of its currency, if the person has one
    const account = await accountFor(ctx, userId, reply.currency, reply.account);
    if (account?.matchedBy === 'kind' && account.id !== record.accountId) changes.accountId = account.id;
  }

  await update(ctx, record.id, changes);
  const was = reply.currency === record.currency && record.currency === 'UZS'
    ? amountDigits(record.amountMinor, record.currency)
    : amountWithUnit(record.amountMinor, record.currency);
  const saved = await log.save(message, confirmed(message.state, `Сумма изменена: было ${was}`));
  await redrawRecordMessage(ctx, saved);

  const changed: RecordView = { ...record, amountMinor: reply.amountMinor, currency: reply.currency };
  const assumed = reply.written ? `. ${quoted(reply.written)} понял как ${amountWithUnit(reply.amountMinor, reply.currency)}` : '';
  await ctx.reply(escapeHtml(`Изменил: ${signedAmount(changed)} · ${quoted(recordName(changed))}${assumed}`), { parse_mode: 'HTML' });
  return true;
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
