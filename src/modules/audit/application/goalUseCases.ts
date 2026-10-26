import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { GoalRepository } from '../domain/auditRepository';
import { SubscriptionState, goalSavingMinor } from '../domain/goal';
import { AuditReader, GoalView, GoalsView } from './auditViews';

const logger = getLogger(LogCategory.TRANSACTION);

/**
 * The goals counting today (FT-131): those of the last finished audit until the end of its month — «Цели после
 * ревизии» on Home and the bot's goal reminders (FT-133). With none, Home invites to the next audit.
 */
export class ListGoalsUseCase {
  constructor(private goals: GoalRepository, private reader: AuditReader) {}

  async execute(input: { userId: string; today?: string }): Promise<Result<GoalsView>> {
    try {
      const today = this.reader.today(input.today);
      const counting = (await this.goals.findByUserId(input.userId)).filter(goal => goal.startsOn <= today && today <= goal.endsOn);
      const { goals, comparison } = await this.reader.goalViews(input.userId, counting, today);
      return ResultHelper.success({
        today,
        startsOn: counting.map(goal => goal.startsOn).sort()[0] ?? null,
        endsOn: counting.map(goal => goal.endsOn).sort().reverse()[0] ?? null,
        goals,
        planMinor: counting.reduce((total, goal) => total + goalSavingMinor(goal), 0),
        comparison,
      });
    } catch (error) {
      logger.error('Failed to read the goals', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read the goals'));
    }
  }
}

/** What the bot reminds of on a day (FT-133). */
export interface GoalReminders {
  /** The «Вдвое меньше» goals counting today, with what was spent since the audit day against the limit. */
  limits: GoalView[];
  /** The subscriptions and tariffs to cancel whose «Напомнить» day is today, with the next charge. */
  subscriptions: GoalView[];
}

/**
 * The goals the bot's reminders are about on `today` (FT-133): «Вдвое меньше» goals counting today — told at 80% of
 * the limit and over it — and the subscriptions whose «Напомнить» day is today, whatever audit made them (the day
 * before a charge may fall in the next month). Other goals have nothing to remind of.
 */
export class ListGoalRemindersUseCase {
  constructor(private goals: GoalRepository, private reader: AuditReader) {}

  async execute(input: { userId: string; today?: string }): Promise<Result<GoalReminders>> {
    try {
      const today = this.reader.today(input.today);
      const all = await this.goals.findByUserId(input.userId);
      const limits = all.filter(goal => goal.kind === 'half' && goal.startsOn <= today && today <= goal.endsOn);
      const subscriptions = all.filter(goal => goal.kind === 'cancel' && goal.subscriptionState === 'remind' && goal.remindOn === today);
      if (limits.length === 0 && subscriptions.length === 0) return ResultHelper.success({ limits: [], subscriptions: [] });
      const { goals } = await this.reader.goalViews(input.userId, [...limits, ...subscriptions], today);
      return ResultHelper.success({
        limits: goals.filter(goal => goal.kind === 'half'),
        subscriptions: goals.filter(goal => goal.kind === 'cancel'),
      });
    } catch (error) {
      logger.error('Failed to read the goals to remind of', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read the goals to remind of'));
    }
  }
}

const SUBSCRIPTION_ANSWERS: ReadonlyArray<SubscriptionState | null> = ['cancelled', 'remind', null];

/**
 * A subscription to cancel: «Уже отменено» (`cancelled` — the day is kept, the next audit leaves the service out
 * unless it is charged after it), «Напомнить» (`remind` — the bot reminds the day before the next charge, FT-133), or
 * `null` to take the answer back. Other goals have nothing to answer.
 */
export class UpdateGoalUseCase {
  constructor(private goals: GoalRepository, private reader: AuditReader) {}

  async execute(input: { userId: string; goalId: string; body: Record<string, unknown>; today?: string }): Promise<Result<GoalView>> {
    if (!Object.prototype.hasOwnProperty.call(input.body, 'subscription') || !SUBSCRIPTION_ANSWERS.includes(input.body.subscription as SubscriptionState | null)) {
      return ResultHelper.failure(new ValidationError('subscription must be cancelled, remind or null', 'subscription'));
    }
    const answer = input.body.subscription as SubscriptionState | null;

    try {
      const today = this.reader.today(input.today);
      const goal = await this.goals.findById(input.goalId);
      if (!goal || goal.userId !== input.userId) return ResultHelper.failure(new NotFoundError('Goal', input.goalId));
      if (goal.kind !== 'cancel') {
        return ResultHelper.failure(new BusinessLogicError('Only a subscription to cancel takes this answer', { reason: 'NOT_A_SUBSCRIPTION' }));
      }

      let updated = goal;
      if (answer === 'cancelled') {
        updated = await this.goals.update(goal.id, { subscriptionState: 'cancelled', cancelledOn: today, remindOn: null });
      } else if (answer === 'remind') {
        // The day the goal shows now: the day before the next charge, as of today
        const [view] = (await this.reader.goalViews(input.userId, [{ ...goal, subscriptionState: null }], today)).goals;
        updated = await this.goals.update(goal.id, { subscriptionState: 'remind', remindOn: view.subscription?.remindOn ?? null, cancelledOn: null });
      } else {
        updated = await this.goals.update(goal.id, { subscriptionState: null, remindOn: null, cancelledOn: null });
      }
      const [view] = (await this.reader.goalViews(input.userId, [updated], today)).goals;
      return ResultHelper.success(view);
    } catch (error) {
      logger.error('Failed to change the goal', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to change the goal'));
    }
  }
}
