import { StatsSummary, CategoryBreakdown, BudgetStatus } from '../types';
import { RU, formatAmount, getMonthName } from '../i18n/ru';

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
    lines.push(`💚 ${RU.commands.today.income(formatAmount(summary.totalIncome))}`);
  }

  if (summary.totalExpense > 0) {
    lines.push(`💸 ${RU.commands.today.expense(formatAmount(summary.totalExpense))}`);
  }

  lines.push('');
  lines.push(`💰 ${RU.commands.today.total(formatAmount(summary.netIncome, true))}`);
  lines.push(`📊 ${RU.commands.today.count(summary.transactionCount)}`);

  // Add category breakdown if available
  if (categories && categories.length > 0) {
    lines.push('');
    lines.push('<b>По категориям:</b>');
    for (const cat of categories.slice(0, 5)) {
      lines.push(`  • ${cat.category}: ${formatAmount(cat.amount)}`);
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
    `💚 ${RU.commands.stats.income}: ${formatAmount(summary.totalIncome)}`,
    `💸 ${RU.commands.stats.expenses}: ${formatAmount(summary.totalExpense)}`,
    `💰 ${RU.commands.stats.balance}: ${formatAmount(summary.netIncome, true)}`,
    `📈 ${RU.commands.stats.transactions}: ${summary.transactionCount}`,
  ];

  // Add top categories
  if (topCategories.length > 0) {
    lines.push('');
    lines.push(`<b>${RU.commands.stats.topCategories}:</b>`);
    for (const cat of topCategories.slice(0, 5)) {
      lines.push(`  • ${cat.category}: ${formatAmount(cat.amount)} (${cat.percentage}%)`);
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
      `   ${formatAmount(budget.spent)} / ${formatAmount(budget.limit)} (${budget.percentage}%)`
    );

    if (budget.remaining > 0) {
      lines.push(`   ${RU.commands.budget.remaining(formatAmount(budget.remaining))}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
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
