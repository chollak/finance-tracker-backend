import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { CategoryResolver, ResolvedCategory } from '../domain/categoryResolver';
import { AccountResolver } from '../domain/accountResolver';
import { CategoryLesson, CategoryLessons } from '../domain/categoryLessons';
import { APPLE_PAY_SOURCE } from '../domain/recordSource';
import { recordWordsOf } from '../../voiceProcessing/domain/categoryGuess';
import { lessonWordsOf, merchantKey } from '../../voiceProcessing/domain/lessonWords';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.LEARNING);

export interface CategoryCorrectionDeps {
  repository: TransactionRepository;
  categoryResolver?: CategoryResolver;
  accountResolver?: AccountResolver;
  categoryLessons?: CategoryLessons;
}

/** What a record can teach, without the record and category it is taught for. */
type Teaching = { kind: 'merchant'; merchant: string } | { kind: 'words'; words: string[] };

/**
 * What a category correction teaches the parser (FT-184). Clients change a category with the new one alone — the Mini
 * App's `PUT { categoryId }`, the bot's «Изменить» — so the lesson is read from the stored record: a card payment's
 * merchant, a phrase's own words, and the category the parse gave it.
 *
 * A record teaches at most one lesson: the category it ends in, when that is not the parse's. Every change of its
 * category first takes back what it taught, then teaches the new one; back to the parse's category («Отменить» in the
 * Mini App) it only takes back. Only starter categories learn — the patterns are shared by every user and keyed by
 * starter key — so the user's own category teaches nothing, and neither does a record made by hand, without a phrase,
 * or a category that only followed a change of type. Learning never fails the edit.
 */
export async function teachCategoryCorrection(
  deps: CategoryCorrectionDeps,
  before: Transaction,
  request: { category?: string; categoryId?: string },
  to: ResolvedCategory | undefined
): Promise<void> {
  const { categoryResolver, categoryLessons } = deps;
  const categoryNamed = request.categoryId !== undefined || request.category !== undefined;
  const recordId = before.id;
  if (!categoryResolver || !categoryLessons || !categoryNamed || !to || to.id === before.categoryId || !recordId) return;

  try {
    // The record left the category it may have been corrected into, wherever it goes now
    await categoryLessons.unlearnRecord(recordId);

    const parsing = before.originalParsing;
    if (!to.presetKey || !parsing) return;
    const parsedId = await parsedCategoryId(categoryResolver, before, parsing);
    if (!parsedId || to.id === parsedId) return;
    const teaching = await teachingOf(deps, before);
    if (!teaching) return;

    const lesson: CategoryLesson = { ...teaching, recordId, userId: before.userId, presetKey: to.presetKey, originalParsing: parsing };
    await categoryLessons.learnCategory(lesson);
  } catch (error) {
    logger.error('Failed to learn from a category correction', error as Error, { transactionId: before.id });
  }
}

/**
 * A card payment teaches its whole merchant — not a payment without one, whose text («Оплата Apple Pay») is the
 * server's; a phrase teaches the words of it that can name a category. A record made by hand teaches nothing.
 */
async function teachingOf(deps: CategoryCorrectionDeps, record: Transaction): Promise<Teaching | null> {
  if (record.source === APPLE_PAY_SOURCE) {
    const merchant = record.merchant ? merchantKey(record.merchant) : '';
    return merchant ? { kind: 'merchant', merchant } : null;
  }
  const text = record.originalText?.trim();
  if (!text) return null;
  const accountNames = deps.accountResolver ? await deps.accountResolver.accountNames(record.userId) : [];
  const words = lessonWordsOf(await ownWords(deps.repository, record, text), accountNames);
  return words.length > 0 ? { kind: 'words', words } : null;
}

/**
 * The category the parse gave the record: stored when it was written. A record written before FT-184 has only the
 * parse's name, resolved again the way it was then — so a category renamed since is not found by it.
 */
async function parsedCategoryId(
  resolver: CategoryResolver,
  record: Transaction,
  parsing: NonNullable<Transaction['originalParsing']>
): Promise<string | undefined> {
  if (parsing.categoryId) return parsing.categoryId;
  const resolved = await resolver.resolveForRecord({
    userId: record.userId,
    type: parsing.type ?? record.type,
    category: parsing.category,
    visibleOnly: true,
  });
  return resolved.success ? resolved.data.id : undefined;
}

/**
 * The words of the record itself. A capture of several records shares one phrase («<id>», «<id>:1», …): each record
 * has only the phrase's words its own note has, so correcting the coffee does not teach the taxi's words.
 */
async function ownWords(repository: TransactionRepository, record: Transaction, text: string): Promise<string> {
  if (!record.clientId) return text;
  const capture = await repository.findByClientId(record.userId, record.clientId.split(':')[0]);
  return recordWordsOf(text, record, capture.length);
}
