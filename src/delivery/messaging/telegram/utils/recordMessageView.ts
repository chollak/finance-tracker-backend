import { InlineKeyboardButton } from 'telegraf/types';
import { BotContext } from '../types';
import {
  formatRecordMessage,
  PickerAccount,
  PickerCategory,
  RecordMessageInput,
  RecordView,
} from '../formatters/recordMessage';
import { recordKeyboard } from '../keyboards/recordKeyboard';
import { createWebAppUrl, isWebAppConfigured, WEB_APP_PATHS } from './webAppUrl';
import { BotMessage, RecordMessageMode, RecordMessageState } from '../../../../modules/botMessage/domain/botMessage';
import { BotMessageLog } from '../../../../modules/botMessage/application/botMessageLog';
import { Transaction } from '../../../../modules/transaction/domain/transactionEntity';
import { normalizeSemanticType } from '../../../../modules/transaction/domain/transactionSemanticType';
import { CapturedTransaction } from '../../../../modules/quickCapture/domain/quickCaptureTypes';
import { minorOf } from '../../../../shared/domain/money/money';
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

/** A record of the message, deleted ones included; undefined if it is gone altogether. */
export async function readRecord(ctx: BotContext, id: string): Promise<Transaction | undefined> {
  const result = await ctx.modules.transactionModule.getGetTransactionByIdUseCase().execute(id, { includeDeleted: true });
  return result.success ? result.data : undefined;
}

function toView(record: Transaction, accountNames: Map<string, string>): RecordView {
  return {
    id: record.id!,
    type: record.type,
    semanticType: normalizeSemanticType(record.semanticType, record.type),
    amountMinor: minorOf(record),
    currency: record.currency === 'USD' ? 'USD' : 'UZS',
    categoryId: record.categoryId,
    categoryName: record.category,
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

async function pickerCategories(ctx: BotContext, userId: string): Promise<PickerCategory[]> {
  const categoryModule = ctx.modules.categoryModule;
  if (!categoryModule) return [];
  const categories = await categoryModule.getCatalog().listForUser(userId);
  return categories
    .filter(category => !category.isHidden)
    .map(category => ({ id: category.id, name: category.name, type: category.type }));
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
  return {
    records: records.filter((record): record is Transaction => Boolean(record)).map(record => toView(record, accounts.names)),
    mode: content.mode,
    state: content.state,
    heard: content.heard,
    today: todayDateOnly(),
    categories,
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

export interface SendRecordMessageInput {
  userId: string;
  recordIds: string[];
  guessed?: string[];
  heard?: string | null;
}

/**
 * The confirmation of records just written: one message for all records of a phrase, remembered in
 * `bot_messages` so its buttons work later, after a restart too.
 */
export async function sendRecordMessage(ctx: BotContext, input: SendRecordMessageInput): Promise<void> {
  if (input.recordIds.length === 0) return;
  const heard = input.heard?.trim() ? input.heard.trim() : null;
  const log = botMessageLog(ctx);
  const drawn = await drawRecordMessage(ctx, {
    userId: input.userId,
    recordIds: input.recordIds,
    mode: 'confirm',
    state: { selected: 0, guessed: input.guessed ?? [] },
    heard,
  });
  if (drawn.input.records.length === 0) return;

  // Without the log nothing could answer the buttons, so the message goes without them
  const sent = await ctx.reply(drawn.text, {
    parse_mode: 'HTML',
    ...(log ? { reply_markup: { inline_keyboard: drawn.keyboard } } : {}),
  });

  const chatId = chatIdOf(ctx);
  if (!log || !sent?.message_id || !chatId) return;
  try {
    await log.remember({
      userId: input.userId,
      chatId,
      messageId: sent.message_id,
      recordIds: input.recordIds,
      guessed: input.guessed,
      heard,
    });
  } catch (error) {
    logger.error('Failed to remember a bot record message', error as Error, { userId: input.userId, messageId: sent.message_id });
  }
}
