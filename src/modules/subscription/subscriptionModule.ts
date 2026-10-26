/**
 * SubscriptionModule
 * Factory class that creates all subscription-related use cases and services
 */

import { SubscriptionRepository } from './domain/subscriptionRepository';
import { UsageLimitRepository } from './domain/usageLimitRepository';

import { CreateSubscriptionUseCase } from './application/createSubscription';
import { GetSubscriptionUseCase } from './application/getSubscription';
import { CheckLimitUseCase } from './application/checkLimit';
import {
  IncrementUsageUseCase,
  DecrementUsageUseCase,
  SetActiveDebtsCountUseCase,
} from './application/incrementUsage';
import { GrantPremiumUseCase, StartTrialUseCase } from './application/grantPremium';
import { CancelSubscriptionUseCase } from './application/cancelSubscription';
import { SubscriptionService } from './application/subscriptionService';

export interface SubscriptionModuleOptions {
  /** Enforce free-tier limits. Defaults to true; the app passes AppConfig.FREE_LIMITS_ENABLED. */
  freeLimitsEnabled?: boolean;
}

export class SubscriptionModule {
  private createSubscriptionUseCase: CreateSubscriptionUseCase;
  private getSubscriptionUseCase: GetSubscriptionUseCase;
  private checkLimitUseCase: CheckLimitUseCase;
  private incrementUsageUseCase: IncrementUsageUseCase;
  private decrementUsageUseCase: DecrementUsageUseCase;
  private setActiveDebtsCountUseCase: SetActiveDebtsCountUseCase;
  private grantPremiumUseCase: GrantPremiumUseCase;
  private startTrialUseCase: StartTrialUseCase;
  private cancelSubscriptionUseCase: CancelSubscriptionUseCase;
  private subscriptionService: SubscriptionService;
  /** Whether free-tier limits are enforced (AppConfig.FREE_LIMITS_ENABLED, decision Д3). */
  readonly freeLimitsEnabled: boolean;

  constructor(
    subscriptionRepository: SubscriptionRepository,
    usageLimitRepository: UsageLimitRepository,
    options: SubscriptionModuleOptions = {}
  ) {
    // Initialize use cases
    this.createSubscriptionUseCase = new CreateSubscriptionUseCase(subscriptionRepository);
    this.freeLimitsEnabled = options.freeLimitsEnabled ?? true;
    this.getSubscriptionUseCase = new GetSubscriptionUseCase(
      subscriptionRepository,
      usageLimitRepository,
      { limitsEnabled: this.freeLimitsEnabled }
    );
    this.checkLimitUseCase = new CheckLimitUseCase(
      subscriptionRepository,
      usageLimitRepository,
      { limitsEnabled: this.freeLimitsEnabled }
    );
    this.incrementUsageUseCase = new IncrementUsageUseCase(usageLimitRepository);
    this.decrementUsageUseCase = new DecrementUsageUseCase(usageLimitRepository);
    this.setActiveDebtsCountUseCase = new SetActiveDebtsCountUseCase(usageLimitRepository);
    this.grantPremiumUseCase = new GrantPremiumUseCase(subscriptionRepository);
    this.startTrialUseCase = new StartTrialUseCase(subscriptionRepository);
    this.cancelSubscriptionUseCase = new CancelSubscriptionUseCase(subscriptionRepository);
    this.subscriptionService = new SubscriptionService(
      subscriptionRepository,
      usageLimitRepository
    );
  }

  // Use Case getters
  getCreateSubscriptionUseCase(): CreateSubscriptionUseCase {
    return this.createSubscriptionUseCase;
  }

  getGetSubscriptionUseCase(): GetSubscriptionUseCase {
    return this.getSubscriptionUseCase;
  }

  getCheckLimitUseCase(): CheckLimitUseCase {
    return this.checkLimitUseCase;
  }

  getIncrementUsageUseCase(): IncrementUsageUseCase {
    return this.incrementUsageUseCase;
  }

  getDecrementUsageUseCase(): DecrementUsageUseCase {
    return this.decrementUsageUseCase;
  }

  getSetActiveDebtsCountUseCase(): SetActiveDebtsCountUseCase {
    return this.setActiveDebtsCountUseCase;
  }

  getGrantPremiumUseCase(): GrantPremiumUseCase {
    return this.grantPremiumUseCase;
  }

  getStartTrialUseCase(): StartTrialUseCase {
    return this.startTrialUseCase;
  }

  getCancelSubscriptionUseCase(): CancelSubscriptionUseCase {
    return this.cancelSubscriptionUseCase;
  }

  getSubscriptionService(): SubscriptionService {
    return this.subscriptionService;
  }
}
