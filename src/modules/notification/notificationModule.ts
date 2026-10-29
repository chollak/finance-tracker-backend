import { NotificationLogRepository } from './domain/notificationLog';
import { SummaryNumbers, SummaryService } from './application/summaryService';
import { DailySummaryNotifier, RecipientSource } from './application/dailySummaryNotifier';
import { ReminderRecipientSource, RemindersNotifier } from './application/remindersNotifier';
import { ReminderSources } from './domain/reminders';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { TransactionModule } from '../transaction/transactionModule';
import { UserModule } from '../user/userModule';
import { AuditModule } from '../audit/auditModule';
import { GoalView } from '../audit/application/auditViews';
import { NotFoundError } from '../../shared/domain/errors/AppError';
import { Result } from '../../shared/domain/types/Result';
import { TelegramAccess } from '../../shared/domain/access/telegramAccess';
import { AppConfig } from '../../shared/infrastructure/config/appConfig';

/**
 * Notices the bot sends on its own and the summaries behind them: итоги дня at the chosen time, /today and /month
 * (FT-124); the goal, subscription and audit reminders after the audit (FT-133). What went out and about what is kept
 * in `notifications_log`, so nothing goes out twice. The numbers are the transaction module's — the totals service of
 * FT-103 and the analytics of FT-120 — and the audit module's goals and audits (FT-131); who gets a notice and when
 * comes from the users and their settings — only those in ALLOWED_TELEGRAM_IDS (FT-153): the base also keeps test users.
 */
export class NotificationModule {
  private summaries: SummaryService;
  private dailySummary: DailySummaryNotifier;
  private reminders?: RemindersNotifier;

  constructor(
    repository: NotificationLogRepository,
    sources: { transactionModule: TransactionModule; userModule: UserModule; auditModule?: AuditModule; access?: TelegramAccess },
    now: () => Date = () => new Date()
  ) {
    const access = sources.access ?? AppConfig.TELEGRAM_ACCESS;
    this.summaries = new SummaryService(summaryNumbers(sources.transactionModule));
    this.dailySummary = new DailySummaryNotifier(repository, summaryRecipients(sources.userModule, access), this.summaries, now);
    if (sources.auditModule) {
      this.reminders = new RemindersNotifier(repository, reminderRecipients(sources.userModule, access), reminderSources(sources.auditModule), now);
    }
  }

  static create(transactionModule: TransactionModule, userModule: UserModule, auditModule: AuditModule): NotificationModule {
    return new NotificationModule(RepositoryFactory.createNotificationLogRepository(), { transactionModule, userModule, auditModule });
  }

  /** Итоги дня и месяца: the daily summary, /today, /month. */
  getSummaries(): SummaryService {
    return this.summaries;
  }

  /** The scheduler of the daily summary; the bot starts it with its sender. */
  getDailySummary(): DailySummaryNotifier {
    return this.dailySummary;
  }

  /** The scheduler of the goal, subscription and audit reminders and the answers to them; none without the audit module. */
  getReminders(): RemindersNotifier | undefined {
    return this.reminders;
  }
}

function summaryNumbers(transactionModule: TransactionModule): SummaryNumbers {
  return {
    periodTotals: (userId, from, to) => transactionModule.getPeriodTotalsUseCase().forPeriod(userId, from, to),
    monthExpenses: async (userId, today, options = {}) => {
      const result = await transactionModule.getMonthAnalyticsUseCase().execute({
        userId, query: { type: 'expense' }, today, throughToday: options.throughToday,
      });
      if (!result.success) throw result.error;
      return result.data;
    },
    firstRecordDate: userId => transactionModule.getRepository().findFirstRecordDate(userId),
  };
}

/** The users and their settings, of those allowed in (FT-153). */
async function allowedUsers(userModule: UserModule, access: TelegramAccess) {
  return (await userModule.listUsersWithSettings()).filter(({ user }) => access.allows(user.telegramId));
}

function summaryRecipients(userModule: UserModule, access: TelegramAccess): RecipientSource {
  return {
    list: async () => (await allowedUsers(userModule, access)).map(({ user, settings }) => ({
      userId: user.id,
      telegramId: user.telegramId,
      timeZone: user.timezone,
      joinedAt: user.createdAt,
      dailySummaryEnabled: settings.dailySummaryEnabled,
      dailySummaryTime: settings.dailySummaryTime,
    })),
  };
}

function reminderRecipients(userModule: UserModule, access: TelegramAccess): ReminderRecipientSource {
  return {
    list: async () => (await allowedUsers(userModule, access)).map(({ user, settings }) => ({
      userId: user.id,
      telegramId: user.telegramId,
      timeZone: user.timezone,
      auditEnabled: settings.auditEnabled,
      auditTime: settings.auditTime,
      goalAlertsEnabled: settings.goalAlertsEnabled,
    })),
  };
}

function data<T>(result: Result<T>): T {
  if (!result.success) throw result.error;
  return result.data;
}

/** The goals and audits of FT-131 as the reminders read and answer them. */
function reminderSources(auditModule: AuditModule): ReminderSources {
  const answered = (goal: Pick<GoalView, 'name' | 'serviceKind' | 'monthlyMinor'>) => ({
    name: goal.name,
    serviceKind: goal.serviceKind ?? ('subscription' as const),
    monthlyMinor: goal.monthlyMinor,
  });
  /** A goal that is not the user's or is gone answers null; any other failure is thrown. */
  const orGone = <T>(result: Result<T>): T | null => (!result.success && result.error instanceof NotFoundError ? null : data(result));

  return {
    audit: async (userId, today) => {
      const audit = data(await auditModule.getCurrentAuditUseCase().execute({ userId, today }));
      return { month: audit.month, state: audit.state, left: audit.summary.left };
    },
    goals: async (userId, today) => {
      const { limits, subscriptions } = data(await auditModule.getListGoalRemindersUseCase().execute({ userId, today }));
      return {
        limits: limits.map(goal => ({ id: goal.id, name: goal.name, spentMinor: goal.spentMinor, limitMinor: goal.periodLimitMinor, endsOn: goal.endsOn })),
        subscriptions: subscriptions.flatMap(goal => {
          const charge = goal.subscription;
          if (!charge?.nextChargeOn || charge.chargeMinor === null) return [];
          return [{ id: goal.id, name: goal.name, serviceKind: goal.serviceKind ?? 'subscription', chargeOn: charge.nextChargeOn, chargeMinor: charge.chargeMinor }];
        }),
      };
    },
    answerSubscription: async (userId, goalId, answer, today) => {
      if (answer === 'keep') {
        const kept = orGone(await auditModule.getKeepSubscriptionUseCase().execute({ userId, goalId }));
        return kept && answered(kept);
      }
      const goal = orGone(await auditModule.getUpdateGoalUseCase().execute({ userId, goalId, body: { subscription: 'cancelled' }, today }));
      return goal && answered(goal);
    },
  };
}
