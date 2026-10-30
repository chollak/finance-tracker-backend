import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { CategoryResolver, ResolvedCategory } from '../domain/categoryResolver';
import { CategoryLessons } from '../domain/categoryLessons';
import { recordWordsOf } from '../../voiceProcessing/domain/categoryGuess';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.LEARNING);

export interface CategoryCorrectionDeps {
  repository: TransactionRepository;
  categoryResolver?: CategoryResolver;
  categoryLessons?: CategoryLessons;
}

/**
 * What a category correction teaches the parser (FT-184). Clients change a category with the new one alone — the Mini
 * App's `PUT { categoryId }`, the bot's «Изменить» — so the lesson is read from the stored record: the words it was made
 * from (the phrase, a payment's merchant) and the category the parse gave it.
 *
 * A record teaches at most one lesson: the category it ends in, when that is not the parse's. A correction takes back
 * what the record taught the category it leaves and teaches the new one; a move back to the parse's category
 * («Отменить» in the Mini App) only takes back. Only starter categories learn — the patterns are shared by every user
 * and keyed by starter key — so the user's own category teaches nothing, and neither does a record made by hand,
 * without a phrase, or a category that only followed a change of type. Learning never fails the edit.
 */
export async function teachCategoryCorrection(
  deps: CategoryCorrectionDeps,
  before: Transaction,
  request: { category?: string; categoryId?: string },
  to: ResolvedCategory | undefined
): Promise<void> {
  const { categoryResolver, categoryLessons } = deps;
  const categoryNamed = request.categoryId !== undefined || request.category !== undefined;
  const text = before.originalText?.trim();
  const parsing = before.originalParsing;
  if (!categoryResolver || !categoryLessons || !categoryNamed || !to || to.id === before.categoryId || !text || !parsing) {
    return;
  }

  try {
    const words = await ownWords(deps.repository, before, text);
    if (!words) return;
    const parsed = await categoryResolver.resolveForRecord({
      userId: before.userId,
      type: parsing.type ?? before.type,
      category: parsing.category,
    });
    if (!parsed.success) return;
    const from = before.categoryId ? await categoryResolver.findForUser(before.userId, before.categoryId) : null;

    const lesson = (presetKey: string) => ({ userId: before.userId, words, presetKey, originalParsing: parsing });
    if (from?.presetKey && from.id !== parsed.data.id) await categoryLessons.unlearnCategory(lesson(from.presetKey));
    if (to.presetKey && to.id !== parsed.data.id) await categoryLessons.learnCategory(lesson(to.presetKey));
  } catch (error) {
    logger.error('Failed to learn from a category correction', error as Error, { transactionId: before.id });
  }
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
