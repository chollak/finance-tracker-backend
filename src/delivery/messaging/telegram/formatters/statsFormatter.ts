import { StatsSummary, CategoryBreakdown, BudgetStatus } from '../types';
import { RU, formatAmount, getMonthName } from '../i18n/ru';
import {
  ExcludedMovementSemanticType,
  WeeklyReviewSummary,
} from '../../../../modules/transaction/application/weeklyReviewService';

const WEEKLY_REVIEW_MOVEMENT_LABELS: Record<ExcludedMovementSemanticType, string> = {
  own_transfer: 'Перевод себе',
  saving_deposit: 'Вклад / накопление',
  debt: 'Долг',
  reimbursement: 'Возврат',
  cash_withdrawal: 'Наличные',
  group_payment: 'Групповой платёж',
};

function formatDateRange(startDate: Date, endDate: Date): string {
  const format = (date: Date) => date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  return `${format(startDate)}–${format(endDate)}`;
}

function formatWeeklyAmount(amount: number, showPlus = false): string {
  return formatAmount(amount, showPlus).replace(/\s/g, ' ');
}

/**
 * Format today's statistics message
 */
export function formatTodayStats(
  summary: StatsSummary,
  categories?: CategoryBreakdown[]
): string {
  if (summary.transactionCount === 0) {
    return `📅 <b>${RU.commands.today.title}</b>\n\n${RU.commands.today.noTransactions}`;
  }

  const lines = [
    `📅 <b>${RU.commands.today.title}</b>`,
    '',
  ];

  if (summary.totalIncome > 0) {
    lines.push(`💚 ${RU.commands.today.income(formatWeeklyAmount(summary.totalIncome))}`);
  }

  if (summary.totalExpense > 0) {
    lines.push(`💸 ${RU.commands.today.expense(formatWeeklyAmount(summary.totalExpense))}`);
  }

  lines.push('');
  lines.push(`💰 ${RU.commands.today.total(formatWeeklyAmount(summary.netIncome, true))}`);
  lines.push(`📊 ${RU.commands.today.count(summary.transactionCount)}`);

  // Add category breakdown if available
  if (categories && categories.length > 0) {
    lines.push('');
    lines.push('<b>По категориям:</b>');
    for (const cat of categories.slice(0, 5)) {
      lines.push(`  • ${cat.category}: ${formatWeeklyAmount(cat.amount)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format monthly statistics message
 */
export function formatMonthStats(
  summary: StatsSummary,
  topCategories: CategoryBreakdown[],
  date: Date
): string {
  const monthName = getMonthName(date);

  if (summary.transactionCount === 0) {
    return `📊 <b>${RU.commands.stats.title(monthName)}</b>\n\n${RU.commands.stats.noData}`;
  }

  const lines = [
    `📊 <b>${RU.commands.stats.title(monthName)}</b>`,
    '',
    `💚 ${RU.commands.stats.income}: ${formatWeeklyAmount(summary.totalIncome)}`,
    `💸 ${RU.commands.stats.expenses}: ${formatWeeklyAmount(summary.totalExpense)}`,
    `💰 ${RU.commands.stats.balance}: ${formatWeeklyAmount(summary.netIncome, true)}`,
    `📈 ${RU.commands.stats.transactions}: ${summary.transactionCount}`,
  ];

  // Add top categories
  if (topCategories.length > 0) {
    lines.push('');
    lines.push(`<b>${RU.commands.stats.topCategories}:</b>`);
    for (const cat of topCategories.slice(0, 5)) {
      lines.push(`  • ${cat.category}: ${formatWeeklyAmount(cat.amount)} (${cat.percentage}%)`);
    }
  }

  // Calculate and show savings rate
  if (summary.totalIncome > 0) {
    const savingsRate = Math.round((summary.netIncome / summary.totalIncome) * 100);
    lines.push('');
    lines.push(RU.commands.stats.savingsRate(Math.max(0, savingsRate)));
  }

  return lines.join('\n');
}

/**
 * Format budget status message
 */
export function formatBudgetStatus(budgets: BudgetStatus[]): string {
  if (budgets.length === 0) {
    return `💰 <b>${RU.commands.budget.title}</b>\n\n${RU.commands.budget.noBudgets}`;
  }

  const lines = [
    `💰 <b>${RU.commands.budget.title}</b>`,
    '',
  ];

  for (const budget of budgets) {
    const statusEmoji = getStatusEmoji(budget.status);
    const statusLabel = getStatusLabel(budget.status);

    lines.push(
      `${statusEmoji} <b>${budget.name}</b> ${statusLabel}`
    );
    lines.push(
      `   ${formatWeeklyAmount(budget.spent)} / ${formatWeeklyAmount(budget.limit)} (${budget.percentage}%)`
    );

    if (budget.remaining > 0) {
      lines.push(`   ${RU.commands.budget.remaining(formatWeeklyAmount(budget.remaining))}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

export function formatWeeklyReviewSummary(summary: WeeklyReviewSummary): string {
  const hasAnySignal = summary.realExpenses > 0
    || summary.income > 0
    || summary.excludedMovementsTotal > 0
    || summary.needsReview.count > 0;

  const lines = [
    '🗓️ <b>Еженедельный обзор</b>',
    `Период: ${formatDateRange(summary.range.startDate, summary.range.endDate)}`,
    '',
  ];

  if (!hasAnySignal) {
    lines.push('За неделю нет транзакций для итогов.');
    lines.push('Можно продолжать добавлять расходы и переводы в Telegram.');
    return lines.join('\n');
  }

  lines.push(`💸 Реальные расходы: ${formatWeeklyAmount(summary.realExpenses)}`);

  if (summary.income > 0) {
    lines.push(`💚 Доходы: ${formatWeeklyAmount(summary.income)}`);
  }

  if (summary.excludedMovementsTotal > 0) {
    lines.push(`↔️ Не расходы: ${formatWeeklyAmount(summary.excludedMovementsTotal)}`);
    for (const [semanticType, amount] of Object.entries(summary.excludedMovementsBreakdown)) {
      if (!amount) continue;
      const label = WEEKLY_REVIEW_MOVEMENT_LABELS[semanticType as ExcludedMovementSemanticType] ?? semanticType;
      lines.push(`  • ${label}: ${formatWeeklyAmount(amount)}`);
    }
  }

  if (summary.needsReview.count > 0) {
    lines.push(`⚠️ Нужно проверить: ${summary.needsReview.count} операции на ${formatWeeklyAmount(summary.needsReview.total)}`);
  }

  if (summary.topCategories.length > 0) {
    lines.push('');
    lines.push('<b>Топ расходов:</b>');
    for (const category of summary.topCategories.slice(0, 5)) {
      lines.push(`  • ${category.category}: ${formatWeeklyAmount(category.amount)}`);
    }
  }

  lines.push('');
  lines.push('Открой Mini App, чтобы исправить операции на проверке и посмотреть детали.');

  return lines.join('\n');
}

/**
 * Get emoji for budget status
 */
function getStatusEmoji(status: 'ok' | 'warning' | 'exceeded'): string {
  switch (status) {
    case 'exceeded':
      return '🔴';
    case 'warning':
      return '🟡';
    case 'ok':
    default:
      return '🟢';
  }
}

/**
 * Get label for budget status
 */
function getStatusLabel(status: 'ok' | 'warning' | 'exceeded'): string {
  switch (status) {
    case 'exceeded':
      return `<b>${RU.commands.budget.exceeded}</b>`;
    case 'warning':
      return `<i>${RU.commands.budget.warning}</i>`;
    case 'ok':
    default:
      return '';
  }
}
