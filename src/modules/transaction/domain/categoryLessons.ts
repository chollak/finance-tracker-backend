import { Transaction } from './transactionEntity';

/**
 * What a record's category correction teaches the parser (FT-184): the record's words point at a starter category.
 * Learned patterns are shared by every user, so a lesson names the starter key — stable across renames — and a user's
 * own category, which has none, teaches nothing. Implemented by `TransactionLearningService`; the transaction module
 * knows only this interface.
 */
export interface CategoryLessons {
  /** The words now point at the starter category: the record was corrected into it. */
  learnCategory(lesson: CategoryLesson): Promise<void>;
  /** Takes back what `learnCategory` taught for the same words and category: the record left it again. */
  unlearnCategory(lesson: CategoryLesson): Promise<void>;
}

export interface CategoryLesson {
  /** The owner of the record. */
  userId: string;
  /** The record's own words: its phrase — of a phrase of several records only this one's — or a payment's merchant. */
  words: string;
  /** Starter key of the category. */
  presetKey: string;
  /** What the parse gave the record, kept in the learning history next to the correction. */
  originalParsing: NonNullable<Transaction['originalParsing']>;
}
