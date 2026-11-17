/**
 * SubscriptionModule
 * Factory class that creates all subscription-related use cases and services
 */

import { SubscriptionRepository } from './domain/subscriptionRepository';
import { UsageLimitRepository } from './domain/usageLimitRepository';
import { GrantTargets } from './domain/grantTargets';

import { CreateSubscriptionUseCase } from './application/createSubscription';
import { GetSubscriptionUseCase } from './application/getSubscription';
import { CheckLimitUseCase } from './application/checkLimit';
import { IncrementUsageUseCase, DecrementUsageUseCase } from './application/incrementUsage';
import { GrantPremiumUseCase } from './application/grantPremium';
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
  private grantPremiumUseCase: GrantPremiumUseCase;
  private cancelSubscriptionUseCase: CancelSubscriptionUseCase;
  private subscriptionService: SubscriptionService;
  /** Whether free-tier limits are enforced (AppConfig.FREE_LIMITS_ENABLED, decision Д3). */
  readonly freeLimitsEnabled: boolean;

  /** `grantTargets`: whom the admin grant may go to — a user that exists (#230). */
  constructor(
    subscriptionRepository: SubscriptionRepository,
    usageLimitRepository: UsageLimitRepository,
    grantTargets: GrantTargets,
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
    this.grantPremiumUseCase = new GrantPremiumUseCase(subscriptionRepository, grantTargets);
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

  /** The bot's limit check before a record (`subscriptionMiddleware`); no HTTP route since #320. */
  getCheckLimitUseCase(): CheckLimitUseCase {
    return this.checkLimitUseCase;
  }

  getIncrementUsageUseCase(): IncrementUsageUseCase {
    return this.incrementUsageUseCase;
  }

  getDecrementUsageUseCase(): DecrementUsageUseCase {
    return this.decrementUsageUseCase;
  }

  getGrantPremiumUseCase(): GrantPremiumUseCase {
    return this.grantPremiumUseCase;
  }

  /** The bot's `/cancel_subscription` (`paymentHandlers`); no HTTP route since #320. */
  getCancelSubscriptionUseCase(): CancelSubscriptionUseCase {
    return this.cancelSubscriptionUseCase;
  }

  getSubscriptionService(): SubscriptionService {
    return this.subscriptionService;
  }
}
