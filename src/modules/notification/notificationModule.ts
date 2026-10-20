import { NotificationLogRepository } from './domain/notificationLog';
import { SummaryNumbers, SummaryService } from './application/summaryService';
import { DailySummaryNotifier, RecipientSource } from './application/dailySummaryNotifier';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { TransactionModule } from '../transaction/transactionModule';
import { UserModule } from '../user/userModule';

/**
 * Notices the bot sends on its own and the summaries behind them (FT-124): итоги дня at the chosen time, /today and
 * /month. What went out and for which period is kept in `notifications_log`, so nothing goes out twice. The numbers
 * are the transaction module's — the totals service of FT-103 and the analytics of FT-120; who gets the summary and
 * when comes from the users and their settings.
 */
export class NotificationModule {
  private summaries: SummaryService;
  private dailySummary: DailySummaryNotifier;

  constructor(
    repository: NotificationLogRepository,
    sources: { transactionModule: TransactionModule; userModule: UserModule },
    now: () => Date = () => new Date()
  ) {
    this.summaries = new SummaryService(summaryNumbers(sources.transactionModule));
    this.dailySummary = new DailySummaryNotifier(repository, summaryRecipients(sources.userModule), this.summaries, now);
  }

  static create(transactionModule: TransactionModule, userModule: UserModule): NotificationModule {
    return new NotificationModule(RepositoryFactory.createNotificationLogRepository(), { transactionModule, userModule });
  }

  /** Итоги дня и месяца: the daily summary, /today, /month. */
  getSummaries(): SummaryService {
    return this.summaries;
  }

  /** The scheduler of the daily summary; the bot starts it with its sender. */
  getDailySummary(): DailySummaryNotifier {
    return this.dailySummary;
  }
}

function summaryNumbers(transactionModule: TransactionModule): SummaryNumbers {
  return {
    periodTotals: (userId, from, to) => transactionModule.getPeriodTotalsUseCase().forPeriod(userId, from, to),
    monthExpenses: async (userId, today) => {
      const result = await transactionModule.getMonthAnalyticsUseCase().execute({ userId, query: { type: 'expense' }, today });
      if (!result.success) throw result.error;
      return result.data;
    },
    firstRecordDate: userId => transactionModule.getRepository().findFirstRecordDate(userId),
  };
}

function summaryRecipients(userModule: UserModule): RecipientSource {
  return {
    list: async () => (await userModule.listUsersWithSettings()).map(({ user, settings }) => ({
      userId: user.id,
      telegramId: user.telegramId,
      timeZone: user.timezone,
      joinedAt: user.createdAt,
      dailySummaryEnabled: settings.dailySummaryEnabled,
      dailySummaryTime: settings.dailySummaryTime,
    })),
  };
}
