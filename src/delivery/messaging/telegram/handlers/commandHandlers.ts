import { Telegraf } from 'telegraf';
import { BotContext, StatsSummary, CategoryBreakdown, BudgetStatus } from '../types';
import { RU } from '../i18n/ru';
import { formatTodayStats, formatMonthStats, formatBudgetStatus } from '../formatters';
import {
  mainMenuKeyboard,
  quickCategoryKeyboard,
  statsKeyboard,
  budgetKeyboard,
  todayKeyboard
} from '../keyboards';

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

  // /help - Help command
  bot.command('help', handleHelp);

  // Legacy /transactions command - redirect to webapp
  bot.command('transactions', handleTransactions);
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

    // Send welcome message with app button
    const keyboard = mainMenuKeyboard(userId);
    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });

    // Send quick category keyboard
    await ctx.reply(RU.quickCategories.title, quickCategoryKeyboard());
  } catch (error) {
    console.error('/start command error:', error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /today - Show today's expenses summary
 */
async function handleToday(ctx: BotContext) {
  try {
    const userId = String(ctx.from?.id);
    const { transactionModule } = ctx.modules;

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

    // Calculate summary
    const summary: StatsSummary = {
      totalIncome: 0,
      totalExpense: 0,
      netIncome: 0,
      transactionCount: todayTransactions.length,
    };

    const categoryMap = new Map<string, { amount: number; count: number }>();

    for (const tx of todayTransactions) {
      if (tx.type === 'income') {
        summary.totalIncome += tx.amount;
      } else {
        summary.totalExpense += tx.amount;
        // Track expense categories
        const existing = categoryMap.get(tx.category) || { amount: 0, count: 0 };
        categoryMap.set(tx.category, {
          amount: existing.amount + tx.amount,
          count: existing.count + 1,
        });
      }
    }
    summary.netIncome = summary.totalIncome - summary.totalExpense;

    // Convert category map to array
    const categories: CategoryBreakdown[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: summary.totalExpense > 0
          ? Math.round((data.amount / summary.totalExpense) * 100)
          : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const message = formatTodayStats(summary, categories);
    const keyboard = todayKeyboard(userId);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });
  } catch (error) {
    console.error('/today command error:', error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /stats - Show monthly statistics
 */
async function handleStats(ctx: BotContext) {
  try {
    const userId = String(ctx.from?.id);
    const { transactionModule } = ctx.modules;

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

    // Calculate summary
    const summary: StatsSummary = {
      totalIncome: 0,
      totalExpense: 0,
      netIncome: 0,
      transactionCount: monthTransactions.length,
    };

    const categoryMap = new Map<string, { amount: number; count: number }>();

    for (const tx of monthTransactions) {
      if (tx.type === 'income') {
        summary.totalIncome += tx.amount;
      } else {
        summary.totalExpense += tx.amount;
        // Track expense categories
        const existing = categoryMap.get(tx.category) || { amount: 0, count: 0 };
        categoryMap.set(tx.category, {
          amount: existing.amount + tx.amount,
          count: existing.count + 1,
        });
      }
    }
    summary.netIncome = summary.totalIncome - summary.totalExpense;

    // Convert to top categories array
    const topCategories: CategoryBreakdown[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: summary.totalExpense > 0
          ? Math.round((data.amount / summary.totalExpense) * 100)
          : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const message = formatMonthStats(summary, topCategories, now);
    const keyboard = statsKeyboard(userId);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });
  } catch (error) {
    console.error('/stats command error:', error);
    await ctx.reply(RU.errors.generic);
  }
}

/**
 * /budget - Show budget status
 */
async function handleBudget(ctx: BotContext) {
  try {
    const userId = String(ctx.from?.id);
    const { budgetModule } = ctx.modules;

    // Get budget summaries with spent calculations
    const summaries = await budgetModule.budgetService.getBudgetSummaries(userId);

    if (summaries.length === 0) {
      const keyboard = budgetKeyboard(userId, false);
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
    const keyboard = budgetKeyboard(userId, true);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...(keyboard || {}),
    });
  } catch (error) {
    console.error('/budget command error:', error);
    await ctx.reply(RU.errors.generic);
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
    await ctx.reply(RU.quickCategories.title, quickCategoryKeyboard());
  } catch (error) {
    console.error('/help command error:', error);
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
    console.error('/transactions command error:', error);
    await ctx.reply(RU.errors.generic);
  }
}
