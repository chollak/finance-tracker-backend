import { InlineKeyboardButton } from 'telegraf/types';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import {
  formatRecordMessage,
  itemName,
  PickerAccount,
  PickerCategory,
  quoted,
  RecordMessageInput,
  RecordView,
} from '../formatters/recordMessage';
import { recordKeyboard } from '../keyboards/recordKeyboard';
import { createWebAppUrl, isWebAppConfigured, WEB_APP_PATHS } from './webAppUrl';
import {
  AssumedThousands,
  BotMessage,
  openQuestion,
  RecordMessageMode,
  RecordMessageState,
} from '../../../../modules/botMessage/domain/botMessage';
import { BotMessageLog } from '../../../../modules/botMessage/application/botMessageLog';
import { Transaction } from '../../../../modules/transaction/domain/transactionEntity';
import { normalizeSemanticType } from '../../../../modules/transaction/domain/transactionSemanticType';
import { CapturedTransaction } from '../../../../modules/quickCapture/domain/quickCaptureTypes';
import { ItemWithoutAmount } from '../../../../modules/voiceProcessing/domain/processedTransaction';
import { isSuspiciouslyLarge } from '../../../../modules/voiceProcessing/domain/largeAmount';
import { minorOf, toMinor } from '../../../../shared/domain/money/money';
import { toDateOnly, todayDateOnly } from '../../../../shared/domain/dates/dateOnly';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * Drawing a record message (FT-122): the records are read from the database every time — deleted ones
 * too, struck through — so the message says what the app has, whoever changed it last.
 */

/** What a record message shows, whether it is stored yet or about to be sent. */
export interface RecordMessageContent {
  userId: string;
  recordIds: string[];
  mode: RecordMessageMode;
  state: RecordMessageState;
  heard: string | null;
}

export interface DrawnRecordMessage {
  text: string;
  keyboard: InlineKeyboardButton[][];
  input: RecordMessageInput;
}

export function botMessageLog(ctx: BotContext): BotMessageLog | undefined {
  return ctx.modules.botMessageModule?.getLog();
}

export function chatIdOf(ctx: BotContext): string | undefined {
  const id = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id ?? ctx.from?.id;
  return id === undefined ? undefined : String(id);
}

/** Records whose category the parse guessed (FT-138): shown with «?». */
export function guessedIds(transactions: Pick<CapturedTransaction, 'id' | 'assumptions'>[]): string[] {
  return transactions
    .filter(transaction => transaction.assumptions?.some(assumption => assumption.kind === 'category'))
    .map(transaction => transaction.id);
}

/** «45» read as 45 000 (FT-103), by record: «"45" понял как 45 000 сум.» in the confirmation (FT-123). */
export function assumedThousands(
  transactions: Pick<CapturedTransaction, 'id' | 'assumptions' | 'amountMinor'>[]
): Record<string, AssumedThousands> {
  const assumed: Record<string, AssumedThousands> = {};
  for (const transaction of transactions) {
    const thousands = transaction.assumptions?.find(assumption => assumption.kind === 'thousands');
    if (thousands?.kind !== 'thousands') continue;
    assumed[transaction.id] = { written: thousands.written, amountMinor: transaction.amountMinor ?? toMinor(thousands.amount) };
  }
  return assumed;
}

/** A record of the message, deleted ones included; undefined if it is gone altogether. */
export async function readRecord(ctx: BotContext, id: string): Promise<Transaction | undefined> {
  const result = await ctx.modules.transactionModule.getGetTransactionByIdUseCase().execute(id, { includeDeleted: true });
  return result.success ? result.data : undefined;
}

interface CategoryFacts {
  isOther: boolean;
  presetKey: string | null;
}

function toView(record: Transaction, accountNames: Map<string, string>, categories: Map<string, CategoryFacts>): RecordView {
  const category = record.categoryId ? categories.get(record.categoryId) : undefined;
  return {
    id: record.id!,
    type: record.type,
    semanticType: normalizeSemanticType(record.semanticType, record.type),
    amountMinor: minorOf(record),
    currency: record.currency === 'USD' ? 'USD' : 'UZS',
    categoryId: record.categoryId,
    categoryName: record.category,
    categoryIsOther: category?.isOther ?? false,
    categoryPresetKey: category?.presetKey ?? null,
    note: record.description?.trim() || record.merchant?.trim() || '',
    accountId: record.accountId,
    accountName: record.accountId ? accountNames.get(record.accountId) : undefined,
    date: toDateOnly(record.date),
    needsReview: record.needsReview === true,
    cancelled: Boolean(record.deletedAt),
  };
}

async function pickerAccounts(ctx: BotContext, userId: string): Promise<{ names: Map<string, string>; visible: PickerAccount[] }> {
  const accountModule = ctx.modules.accountModule;
  if (!accountModule) return { names: new Map(), visible: [] };
  const accounts = await accountModule.getBook().listForUser(userId);
  return {
    names: new Map(accounts.map(account => [account.id, account.name])),
    visible: accounts.filter(account => !account.isHidden).map(account => ({ id: account.id, name: account.name, currency: account.currency })),
  };
}

async function pickerCategories(ctx: BotContext, userId: string): Promise<{ facts: Map<string, CategoryFacts>; visible: PickerCategory[] }> {
  const categoryModule = ctx.modules.categoryModule;
  if (!categoryModule) return { facts: new Map(), visible: [] };
  const categories = await categoryModule.getCatalog().listForUser(userId);
  return {
    // Every category of the user, hidden ones too: a record may sit in one
    facts: new Map(categories.map(category => [category.id, { isOther: category.isOther, presetKey: category.presetKey }])),
    visible: categories
      .filter(category => !category.isHidden)
      .map(category => ({ id: category.id, name: category.name, type: category.type })),
  };
}

function appLinks(telegramId: string): Pick<RecordMessageInput, 'recordUrl' | 'historyUrl'> {
  if (!isWebAppConfigured()) return {};
  const safe = (build: () => string) => {
    try {
      return build();
    } catch {
      return undefined;
    }
  };
  return {
    recordUrl: id => safe(() => createWebAppUrl(telegramId, { edit: id })),
    historyUrl: safe(() => createWebAppUrl(telegramId, { path: WEB_APP_PATHS.transactions })),
  };
}

/** Everything the formatter and the keyboard need, read now. */
export async function recordMessageInput(ctx: BotContext, content: RecordMessageContent): Promise<RecordMessageInput> {
  const [records, accounts, categories] = await Promise.all([
    Promise.all(content.recordIds.map(id => readRecord(ctx, id))),
    pickerAccounts(ctx, content.userId),
    pickerCategories(ctx, content.userId),
  ]);
  const views = records.filter((record): record is Transaction => Boolean(record)).map(record => toView(record, accounts.names, categories.facts));
  // A large amount the person chose not to write leaves the message (FT-123): one line says so
  const declined = new Set(content.state.declined ?? []);
  return {
    records: views.filter(record => !declined.has(record.id)),
    declined: views.filter(record => declined.has(record.id)),
    mode: content.mode,
    state: content.state,
    heard: content.heard,
    today: todayDateOnly(),
    categories: categories.visible,
    accounts: accounts.visible,
    ...appLinks(String(ctx.from?.id ?? '')),
  };
}

export async function drawRecordMessage(ctx: BotContext, content: RecordMessageContent): Promise<DrawnRecordMessage> {
  const input = await recordMessageInput(ctx, content);
  return { text: formatRecordMessage(input), keyboard: recordKeyboard(input), input };
}

function isNotModified(error: unknown): boolean {
  return /message is not modified/i.test(error instanceof Error ? error.message : String(error));
}

/** Draws a stored message again in its chat: after a press, an answer to «Сумму», /undo. */
export async function redrawRecordMessage(ctx: BotContext, message: BotMessage): Promise<DrawnRecordMessage> {
  const drawn = await drawRecordMessage(ctx, message);
  try {
    await ctx.telegram.editMessageText(message.chatId, message.messageId, undefined, drawn.text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: drawn.keyboard },
    });
  } catch (error) {
    if (!isNotModified(error)) throw error;
  }
  return drawn;
}

/** Edits a plain bot message of the chat (the /undo reply), ignoring «not modified». */
export async function editPlainMessage(ctx: BotContext, chatId: string, messageId: number, text: string, keyboard: InlineKeyboardButton[][] = []): Promise<void> {
  try {
    await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (error) {
    if (!isNotModified(error)) throw error;
  }
}

/** Deletes records softly — «Отменить», /undo, a large amount held until it is confirmed (FT-123). */
export async function cancelRecords(ctx: BotContext, records: RecordView[]): Promise<void> {
  for (const record of records) {
    const result = await ctx.modules.transactionModule.getDeleteTransactionUseCase().execute({ id: record.id });
    if (!result.success) throw result.error;
  }
}

/** Brings softly deleted records back — «Вернуть», a large amount confirmed (FT-123). */
export async function restoreRecords(ctx: BotContext, records: RecordView[]): Promise<void> {
  for (const record of records) {
    const result = await ctx.modules.transactionModule.getRestoreTransactionUseCase().execute({ id: record.id });
    if (!result.success) throw result.error;
  }
}

/**
 * The message's question closed honestly (design-system «Один вопрос за раз», FT-123): «Сумму» goes back to
 * «Изменить» (to the confirmation when the record is gone), an item without an amount gets «— без суммы, не
 * записал.», a large amount keeps its buttons without «Если сумма другая — напишите её».
 */
export function closedQuestion(message: BotMessage, recordGone = false): { mode: RecordMessageMode; state: RecordMessageState } {
  const state: RecordMessageState = { ...message.state };
  let { mode } = message;
  if (mode === 'amount') mode = recordGone ? 'confirm' : 'edit';
  if (mode === 'large' && state.large) state.large = { ...state.large, replyClosed: true };
  if (state.missing?.length) {
    state.notes = [...(state.notes ?? []), ...state.missing.map(item => RU.record.withoutAmountNotWritten(quoted(itemName(item))))];
    delete state.missing;
  }
  return { mode, state };
}

/** Closes the message's question and draws it again; the log keeps the change even if Telegram refuses the edit. */
export async function closeQuestion(ctx: BotContext, log: BotMessageLog, message: BotMessage, recordGone = false): Promise<void> {
  const closed = await log.save(message, closedQuestion(message, recordGone));
  try {
    await redrawRecordMessage(ctx, closed);
  } catch (error) {
    // An old message that cannot be drawn keeps its old buttons
    logger.warn('Could not redraw a closed question', { messageId: message.messageId, error: (error as Error).message });
  }
}

/** One question at a time: a new question closes every other open one of the chat. */
export async function closeOtherQuestions(ctx: BotContext, log: BotMessageLog, message: BotMessage): Promise<void> {
  for (const other of await log.otherQuestions(message)) await closeQuestion(ctx, log, other);
}

export interface SendRecordMessageInput {
  userId: string;
  recordIds: string[];
  guessed?: string[];
  heard?: string | null;
  /** «45» read as 45 000, by record (FT-123). */
  assumed?: Record<string, AssumedThousands>;
  /** Named without an amount: the message asks «Сколько?» (FT-123). */
  missing?: ItemWithoutAmount[];
}

/**
 * The confirmation of records just written: one message for all records of a phrase, remembered in
 * `bot_messages` so its buttons work later, after a restart too. A suspiciously large amount holds the
 * whole message — its records are deleted softly until the person answers (FT-123); what was named without
 * an amount is asked «Сколько?», unless a large amount takes the question.
 */
export async function sendRecordMessage(ctx: BotContext, input: SendRecordMessageInput): Promise<void> {
  const missing = input.missing ?? [];
  if (input.recordIds.length === 0 && missing.length === 0) return;
  const heard = input.heard?.trim() ? input.heard.trim() : null;
  const log = botMessageLog(ctx);
  let mode: RecordMessageMode = 'confirm';
  const state: RecordMessageState = {
    selected: 0,
    guessed: input.guessed ?? [],
    ...(input.assumed && Object.keys(input.assumed).length ? { assumed: input.assumed } : {}),
    ...(missing.length ? { missing } : {}),
  };

  const before = await recordMessageInput(ctx, { userId: input.userId, recordIds: input.recordIds, mode, state, heard });
  if (before.records.length === 0 && missing.length === 0) return;

  // Without the log nothing could answer the question, so a large amount is written as it is
  const large = log ? before.records.findIndex(record => !record.cancelled && isSuspiciouslyLarge({ ...record, presetKey: record.categoryPresetKey })) : -1;
  if (large !== -1) {
    await cancelRecords(ctx, before.records.filter(record => !record.cancelled));
    mode = 'large';
    state.large = { index: large };
    if (missing.length) {
      state.notes = missing.map(item => RU.record.withoutAmountNotWritten(quoted(itemName(item))));
      delete state.missing;
    }
  }
  const content = { userId: input.userId, recordIds: input.recordIds, mode, state, heard };
  const drawn = await drawRecordMessage(ctx, content);

  // Without the log nothing could answer the buttons, so the message goes without them
  const sent = await ctx.reply(drawn.text, {
    parse_mode: 'HTML',
    ...(log ? { reply_markup: { inline_keyboard: drawn.keyboard } } : {}),
  });

  const chatId = chatIdOf(ctx);
  if (!log || !sent?.message_id || !chatId) return;
  try {
    const remembered = await log.remember({ ...content, chatId, messageId: sent.message_id });
    if (openQuestion(mode, state)) await closeOtherQuestions(ctx, log, remembered);
  } catch (error) {
    logger.error('Failed to remember a bot record message', error as Error, { userId: input.userId, messageId: sent.message_id });
  }
}
