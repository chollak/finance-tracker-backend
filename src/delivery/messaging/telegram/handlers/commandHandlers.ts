import { Telegraf } from 'telegraf';
import { BotContext, StatsSummary, CategoryBreakdown, BudgetStatus } from '../types';
import { RU } from '../i18n/ru';
import { formatTodayStats, formatMonthStats, formatBudgetStatus, formatWeeklyReviewSummary } from '../formatters';
import {
  mainMenuKeyboard,
  quickCategoryKeyboard,
  statsKeyboard,
  budgetKeyboard,
  todayKeyboard
} from '../keyboards';
import { resolveUserIdToUUID } from '../../../../shared/application/helpers/userIdResolver';
import { botUserId, quickAddCategories } from '../utils/userCategories';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';
import { getPreviousWeekRange, summarizeWeeklyReview } from '../../../../modules/transaction/application/weeklyReviewService';
import { fromMinor } from '../../../../shared/domain/money/money';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * Register all command handlers
 */
export function registerCommandHandlers(bot: Telegraf<BotContext>) {
  // /start - Welcome and onboarding
  bot.command('start', handleStart);

  // /today - Today's expenses
  bot.command('today', handleToday);

  // /stats - Monthly statistics
  bot.command('stats', handleStats);

  // /budget - Budget status
  bot.command('budget', handleBudget);

  // /week, /weekly - Previous week semantic review
  bot.command('week', handleWeeklyReview);
  bot.command('weekly', handleWeeklyReview);

  // /help - Help command
  bot.command('help', handleHelp);

  // Legacy /transactions command - redirect to webapp
  bot.command('transactions', handleTransactions);
}

async function handleWeeklyReview(ctx: BotContext) {
  try {
    const telegramId = String(ctx.from?.id);
    const { transactionModule, userModule } = ctx.modules;
    const userId = await resolveUserIdToUUID(telegramId, userModule);
    const transactions = await transactionModule
      .getGetUserTransactionsUseCase()
      .execute(userId);
    const usdRateMinor = await transactionModule.getPeriodTotalsService().usdRateFor(userId, transactions);
    const summary = summarizeWeeklyReview(transactions, getPreviousWeekRange(), { usdRateMinor });

    await ctx.reply(formatWeeklyReviewSummary(summary), {
      parse_mode: 'HTML',
      ...(todayKeyboard(telegramId) || {}),
    });
  } catch (error) {
    logger.error('/week command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /start - Enhanced onboarding with quick categories
 */
async function handleStart(ctx: BotContext) {
  try {
    const userId = String(ctx.from?.id ?? 'unknown');
    const userName = ctx.from?.first_name || 'друг';

    const message = [
      `${RU.welcome.greeting(userName)}`,
      '',
      RU.welcome.description,
    ].join('\n');

    // First, remove any old reply keyboards
    await ctx.reply('...', {
      reply_markup: { remove_keyboard: true },
    }).then(msg => ctx.deleteMessage(msg.message_id)).catch(() => {});

    // Send welcome message with app button
    const keyboard = mainMenuKeyboard(userId);
    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });

    // Quick-add keyboard from the user's own categories (FT-100)
    await sendQuickCategories(ctx);
  } catch (error) {
    logger.error('/start command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /today - Show today's expenses summary
 */
async function handleToday(ctx: BotContext) {
  try {
    const telegramId = String(ctx.from?.id);
    const { transactionModule, userModule } = ctx.modules;

    // Resolve telegramId to UUID
    const userId = await resolveUserIdToUUID(telegramId, userModule);

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch transactions for today
    const transactions = await transactionModule
      .getGetUserTransactionsUseCase()
      .execute(userId);

    // Filter today's transactions
    const todayTransactions = transactions.filter((tx: any) => {
      const txDate = new Date(tx.date);
      return txDate >= today && txDate <= endOfDay;
    });

    // The shared period totals (FT-103): real income and expenses, records awaiting review apart,
    // dollars at the user's effective rate
    const totals = await transactionModule.getPeriodTotalsService().summarize(userId, todayTransactions);
    const summary: StatsSummary = {
      totalIncome: fromMinor(totals.incomeMinor),
      totalExpense: fromMinor(totals.expenseMinor),
      netIncome: fromMinor(totals.netMinor),
      transactionCount: todayTransactions.length,
    };

    // Convert category map to array
    const categories: CategoryBreakdown[] = totals.categories.map(category => ({
      category: category.category,
      amount: fromMinor(category.amountMinor),
      count: category.count,
      percentage: Math.round(category.percentage),
    }));

    const message = formatTodayStats(summary, categories);
    const keyboard = todayKeyboard(telegramId);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });
  } catch (error) {
    logger.error('/today command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /stats - Show monthly statistics
 */
async function handleStats(ctx: BotContext) {
  try {
    const telegramId = String(ctx.from?.id);
    const { transactionModule, userModule } = ctx.modules;

    // Resolve telegramId to UUID
    const userId = await resolveUserIdToUUID(telegramId, userModule);

    // Get current month date range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Fetch all transactions
    const transactions = await transactionModule
      .getGetUserTransactionsUseCase()
      .execute(userId);

    // Filter this month's transactions
    const monthTransactions = transactions.filter((tx: any) => {
      const txDate = new Date(tx.date);
      return txDate >= startOfMonth && txDate <= endOfMonth;
    });

    // The shared period totals (FT-103): real income and expenses, records awaiting review apart,
    // dollars at the user's effective rate
    const totals = await transactionModule.getPeriodTotalsService().summarize(userId, monthTransactions);
    const summary: StatsSummary = {
      totalIncome: fromMinor(totals.incomeMinor),
      totalExpense: fromMinor(totals.expenseMinor),
      netIncome: fromMinor(totals.netMinor),
      transactionCount: monthTransactions.length,
    };

    // Convert to top categories array
    const topCategories: CategoryBreakdown[] = totals.categories.slice(0, 5).map(category => ({
      category: category.category,
      amount: fromMinor(category.amountMinor),
      count: category.count,
      percentage: Math.round(category.percentage),
    }));

    const message = formatMonthStats(summary, topCategories, now);
    const keyboard = statsKeyboard(telegramId);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });
  } catch (error) {
    logger.error('/stats command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /budget - Show budget status
 */
async function handleBudget(ctx: BotContext) {
  try {
    const telegramId = String(ctx.from?.id);
    const { budgetModule, userModule } = ctx.modules;

    // Resolve telegramId to UUID
    const userId = await resolveUserIdToUUID(telegramId, userModule);

    // Get budget summaries with spent calculations
    const summaries = await budgetModule.budgetService.getBudgetSummaries(userId);

    if (summaries.length === 0) {
      const keyboard = budgetKeyboard(telegramId, false);
      await ctx.reply(`💰 <b>${RU.commands.budget.title}</b>\n\n${RU.commands.budget.noBudgets}`, {
        parse_mode: 'HTML',
        ...(keyboard || {}),
      });
      return;
    }

    // Convert BudgetSummary to BudgetStatus for formatting
    const budgets: BudgetStatus[] = summaries.map(s => ({
      id: s.id,
      name: s.name,
      category: '', // BudgetSummary doesn't include category directly
      limit: s.amount,
      spent: s.spent,
      remaining: s.remaining,
      percentage: Math.round(s.percentageUsed),
      status: s.isOverBudget ? 'exceeded' : s.percentageUsed >= 80 ? 'warning' : 'ok',
    }));

    const message = formatBudgetStatus(budgets);
    const keyboard = budgetKeyboard(telegramId, true);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });
  } catch (error) {
    logger.error('/budget command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/** The quick-add keyboard, built from the user's visible expense categories; nothing without them. */
async function sendQuickCategories(ctx: BotContext) {
  const categories = await quickAddCategories(ctx, await botUserId(ctx));
  if (categories.length > 0) {
    await ctx.reply(RU.quickCategories.title, quickCategoryKeyboard(categories));
  }
}

/**
 * /help - Show help with quick categories
 */
async function handleHelp(ctx: BotContext) {
  try {
    await ctx.reply(RU.commands.help.content, {
      parse_mode: 'HTML',
    });

    // Also send quick categories for convenience
    await sendQuickCategories(ctx);
  } catch (error) {
    logger.error('/help command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /transactions - Legacy command, redirect to webapp
 */
async function handleTransactions(ctx: BotContext) {
  try {
    const userId = String(ctx.from?.id);
    const keyboard = todayKeyboard(userId);

    if (keyboard) {
      await ctx.reply(`📊 ${RU.buttons.viewAll}`, keyboard);
    } else {
      await ctx.reply(RU.errors.webAppNotConfigured);
    }
  } catch (error) {
    logger.error('/transactions command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}
