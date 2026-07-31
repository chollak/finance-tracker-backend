import { BudgetPeriod } from '../domain/budgetEntity';

export interface BudgetPeriodRange {
  startDate: string;
  endDate: string;
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addPeriod(start: Date, period: BudgetPeriod): Date {
  const end = new Date(start);

  switch (period) {
    case BudgetPeriod.DAILY:
      end.setUTCDate(end.getUTCDate() + 1);
      return end;
    case BudgetPeriod.WEEKLY:
      end.setUTCDate(end.getUTCDate() + 7);
      return end;
    case BudgetPeriod.MONTHLY:
      end.setUTCMonth(end.getUTCMonth() + 1);
      return end;
    case BudgetPeriod.QUARTERLY:
      end.setUTCMonth(end.getUTCMonth() + 3);
      return end;
    case BudgetPeriod.YEARLY:
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      return end;
    default:
      end.setUTCMonth(end.getUTCMonth() + 1);
      return end;
  }
}

export class BudgetPeriodCalculator {
  static getCurrentRange(period: BudgetPeriod, anchorDate: string | Date, now: Date = new Date()): BudgetPeriodRange {
    const anchor = toUtcDateOnly(typeof anchorDate === 'string' ? new Date(anchorDate) : anchorDate);
    const reference = toUtcDateOnly(now);

    if (Number.isNaN(anchor.getTime())) {
      throw new Error('Invalid budget anchor date');
    }

    if (reference < anchor) {
      const preAnchorEnd = addPeriod(anchor, period);
      return {
        startDate: formatDateOnly(anchor),
        endDate: formatDateOnly(preAnchorEnd),
      };
    }

    let start = new Date(anchor);
    let end = addPeriod(start, period);

    while (reference >= end) {
      start = end;
      end = addPeriod(start, period);
    }

    return {
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
    };
  }

  static getDaysRemaining(endDate: string | Date, now: Date = new Date()): number {
    const reference = toUtcDateOnly(now);
    const end = toUtcDateOnly(typeof endDate === 'string' ? new Date(endDate) : endDate);
    return Math.max(0, Math.ceil((end.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24)));
  }
}
