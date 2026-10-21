import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { AuditRepository, GoalRepository } from './domain/auditRepository';
import { AuditSources } from './domain/auditSources';
import { AuditReader } from './application/auditViews';
import { DecideAuditCandidateUseCase, FinishAuditUseCase, GetCurrentAuditUseCase } from './application/auditUseCases';
import { ListGoalsUseCase, UpdateGoalUseCase } from './application/goalUseCases';

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
 * a subscription's next charge, «Уже отменено» and «Напомнить». Reads records, categories and the rate through
 * `AuditSources`, wired in `createModules()`.
 */
export class AuditModule {
  private getCurrent: GetCurrentAuditUseCase;
  private decide: DecideAuditCandidateUseCase;
  private finish: FinishAuditUseCase;
  private listGoals: ListGoalsUseCase;
  private updateGoal: UpdateGoalUseCase;

  constructor(dependencies: AuditModuleDependencies) {
    const { audits, goals, sources } = dependencies;
    const reader = new AuditReader(sources, goals, dependencies.now ?? (() => new Date()));
    this.getCurrent = new GetCurrentAuditUseCase(audits, goals, sources, reader);
    this.decide = new DecideAuditCandidateUseCase(audits, goals, reader);
    this.finish = new FinishAuditUseCase(audits, goals, reader);
    this.listGoals = new ListGoalsUseCase(goals, reader);
    this.updateGoal = new UpdateGoalUseCase(goals, reader);
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
}
