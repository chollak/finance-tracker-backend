import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { AuditRepository, GoalRepository } from './domain/auditRepository';
import { AuditSources } from './domain/auditSources';
import { AuditReader } from './application/auditViews';
import { AuditGoalSync } from './application/auditGoalSync';
import { DecideAuditCandidateUseCase, FinishAuditUseCase, GetCurrentAuditUseCase, KeepSubscriptionUseCase } from './application/auditUseCases';
import { ListGoalRemindersUseCase, ListGoalsUseCase, UpdateGoalUseCase } from './application/goalUseCases';

export interface AuditModuleDependencies {
  audits: AuditRepository;
  goals: GoalRepository;
  sources: AuditSources;
  /** The clock: today is its day in Tashkent. */
  now?: () => Date;
}

/**
 * The spending audit (FT-130 rules, FT-131 storage and goals): the audit of the month before, opened once with the
 * candidates the rules find and the undecided ones of the month before; «Нужно / Лишнее» and the goal of each;
 * «Готово» and the goals it makes — limits from the audit day, compared with the same days of the month before;
 * a subscription's next charge, «Уже отменено» and «Напомнить»; what the bot reminds of and «Оставить» under its
 * subscription reminder (FT-133). Reads records, categories and the rate through
 * `AuditSources`, wired in `createModules()`.
 */
export class AuditModule {
  private getCurrent: GetCurrentAuditUseCase;
  private decide: DecideAuditCandidateUseCase;
  private finish: FinishAuditUseCase;
  private listGoals: ListGoalsUseCase;
  private updateGoal: UpdateGoalUseCase;
  private goalReminders: ListGoalRemindersUseCase;
  private keepSubscription: KeepSubscriptionUseCase;

  constructor(dependencies: AuditModuleDependencies) {
    const { audits, goals, sources } = dependencies;
    const reader = new AuditReader(sources, goals, dependencies.now ?? (() => new Date()));
    // One for both: the goal syncs of an audit run one after another
    const goalSync = new AuditGoalSync(audits, goals);
    this.getCurrent = new GetCurrentAuditUseCase(audits, goals, sources, reader);
    this.decide = new DecideAuditCandidateUseCase(audits, goalSync, reader);
    this.finish = new FinishAuditUseCase(audits, goalSync, reader);
    this.listGoals = new ListGoalsUseCase(goals, reader);
    this.updateGoal = new UpdateGoalUseCase(goals, reader);
    this.goalReminders = new ListGoalRemindersUseCase(goals, reader);
    this.keepSubscription = new KeepSubscriptionUseCase(audits, goals, goalSync);
  }

  static create(sources: AuditSources): AuditModule {
    return new AuditModule({
      audits: RepositoryFactory.createAuditRepository(),
      goals: RepositoryFactory.createGoalRepository(),
      sources,
    });
  }

  getCurrentAuditUseCase(): GetCurrentAuditUseCase {
    return this.getCurrent;
  }

  getDecideAuditCandidateUseCase(): DecideAuditCandidateUseCase {
    return this.decide;
  }

  getFinishAuditUseCase(): FinishAuditUseCase {
    return this.finish;
  }

  getListGoalsUseCase(): ListGoalsUseCase {
    return this.listGoals;
  }

  getUpdateGoalUseCase(): UpdateGoalUseCase {
    return this.updateGoal;
  }

  /** The goals and subscriptions the bot reminds of today (FT-133). */
  getListGoalRemindersUseCase(): ListGoalRemindersUseCase {
    return this.goalReminders;
  }

  /** «Оставить» under the bot's subscription reminder (FT-133). */
  getKeepSubscriptionUseCase(): KeepSubscriptionUseCase {
    return this.keepSubscription;
  }
}
