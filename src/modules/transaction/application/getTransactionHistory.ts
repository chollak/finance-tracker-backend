import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isValidDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import {
  HistoryCursor,
  HistoryFilters,
  HistorySummary,
  narrowsHistory,
  parseHistorySearch,
  summarizeHistory,
} from '../domain/transactionHistory';
import { PeriodTotalsService } from './periodTotalsService';

const logger = getLogger(LogCategory.TRANSACTION);

export const HISTORY_PAGE_DEFAULT = 50;
export const HISTORY_PAGE_MAX = 100;
const QUERY_MAX_LENGTH = 100;
const STORED_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;
const IDS_MAX = 50;

export interface TransactionHistory {
  items: Transaction[];
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /**
   * Everything a search or a filter found (FT-116: «2 операции · −109 000 сум» under the filters) — on the first
   * page of a narrowed history; null on later pages and for the whole history.
   */
  summary: HistorySummary | null;
}

const fail = (message: string, field: string) => ResultHelper.failure(new ValidationError(message, field));

function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify([cursor.date, cursor.createdAt, cursor.id])).toString('base64url');
}

function decodeCursor(value: string): HistoryCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 3 || !parsed.every(part => typeof part === 'string')) return null;
    const [date, createdAt, id] = parsed as string[];
    // The date as stored: records written before FT-100 may keep a full moment («2026-10-14T05:30:00.000Z»)
    if (!STORED_DATE.test(date) || Number.isNaN(Date.parse(createdAt)) || !id) return null;
    return { date, createdAt, id };
  } catch {
    return null;
  }
}

/** `a,b` or a repeated parameter (`?categoryIds=a&categoryIds=b`). */
function idList(value: unknown): string[] | null {
  const parts = (Array.isArray(value) ? value : [value]).flatMap(part => (typeof part === 'string' ? part.split(',') : [null]));
  if (parts.some(part => part === null)) return null;
  return [...new Set((parts as string[]).map(part => part.trim()).filter(Boolean))];
}

/**
 * History with search and filters (FT-107): `q`, `categoryIds`, `accountIds`, `type`, `from`, `to`,
 * `cursor`, `limit`. Search ignores case and «ё» (Russian rules): every word is looked for in the note, the
 * merchant, the category's current name and the account's name, and digits start the amount (FT-116). Pages go
 * by a cursor, newest first; the first page of a search or a filter sums up all it found, dollars at the user's
 * rate.
 */
export class GetTransactionHistoryUseCase {
  constructor(
    private repository: TransactionRepository,
    private periodTotals: PeriodTotalsService
  ) {}

  async execute(input: { userId: string; query: Record<string, unknown> }): Promise<Result<TransactionHistory>> {
    const { query } = input;
    const filters: HistoryFilters = {};

    if (query.q !== undefined) {
      if (typeof query.q !== 'string') return fail('q must be text', 'q');
      if (query.q.length > QUERY_MAX_LENGTH) return fail(`q must be at most ${QUERY_MAX_LENGTH} characters`, 'q');
      const search = parseHistorySearch(query.q);
      if (search) filters.search = search;
    }
    for (const field of ['categoryIds', 'accountIds'] as const) {
      if (query[field] === undefined) continue;
      const ids = idList(query[field]);
      if (!ids || ids.length > IDS_MAX) return fail(`${field} must be a comma-separated list of at most ${IDS_MAX} ids`, field);
      if (ids.length > 0) filters[field] = ids;
    }
    if (query.type !== undefined) {
      if (query.type !== 'income' && query.type !== 'expense') return fail('type must be income or expense', 'type');
      filters.type = query.type;
    }
    for (const field of ['from', 'to'] as const) {
      if (query[field] === undefined) continue;
      if (!isValidDateOnly(query[field])) return fail(`${field} must be a date YYYY-MM-DD`, field);
      filters[field] = query[field] as string;
    }
    if (filters.from && filters.to && filters.from > filters.to) return fail('from must not be after to', 'from');

    let cursor: HistoryCursor | null = null;
    if (query.cursor !== undefined) {
      cursor = typeof query.cursor === 'string' ? decodeCursor(query.cursor) : null;
      if (!cursor) return fail('cursor is not one this API gave', 'cursor');
    }

    let limit = HISTORY_PAGE_DEFAULT;
    if (query.limit !== undefined) {
      limit = Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_PAGE_MAX) {
        return fail(`limit must be a whole number from 1 to ${HISTORY_PAGE_MAX}`, 'limit');
      }
    }

    try {
      const page = await this.repository.findHistory(input.userId, filters, cursor, limit);
      let summary: HistorySummary | null = null;
      if (!cursor && narrowsHistory(filters)) {
        const amounts = await this.repository.findHistoryAmounts(input.userId, filters);
        summary = summarizeHistory(amounts, await this.periodTotals.usdRateFor(input.userId, amounts));
      }
      return ResultHelper.success({ items: page.items, nextCursor: page.next ? encodeCursor(page.next) : null, summary });
    } catch (error) {
      logger.error('Failed to read history', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read history'));
    }
  }
}
