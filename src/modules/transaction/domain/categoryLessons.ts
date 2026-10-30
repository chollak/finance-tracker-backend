import { Transaction } from './transactionEntity';

/**
 * What a record's category correction teaches the parser (FT-184). Learned patterns are shared by every user, so a
 * lesson names the starter key — stable across renames — and a user's own category, which has none, teaches nothing.
 * Implemented by `TransactionLearningService`; the transaction module knows only this interface.
 */
export interface CategoryLessons {
  /** The record was corrected into the starter category: its words or its merchant now point at it. */
  learnCategory(lesson: CategoryLesson): Promise<void>;
  /** Takes back every lesson the record taught: it left the category it was corrected into. */
  unlearnRecord(recordId: string): Promise<void>;
}

interface LessonOfRecord {
  /** The record that teaches: its lessons are taken back by it, whatever its words read by then. */
  recordId: string;
  /** The owner of the record. */
  userId: string;
  /** Starter key of the category. */
  presetKey: string;
  /** What the parse gave the record, kept in the learning history next to the correction. */
  originalParsing: NonNullable<Transaction['originalParsing']>;
}

/**
 * A phrase teaches the words of it that can name a category (`lessonWordsOf`), each counted on its own; a card payment
 * teaches its whole merchant (`merchantKey`), looked up exactly.
 */
export type CategoryLesson =
  | (LessonOfRecord & { kind: 'words'; words: readonly string[] })
  | (LessonOfRecord & { kind: 'merchant'; merchant: string });
