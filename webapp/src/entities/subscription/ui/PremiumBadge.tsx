import { Badge } from '@/shared/ui/badge';
import type { SubscriptionStatus } from '../model/types';

interface PremiumBadgeProps {
  subscription: SubscriptionStatus | undefined;
  isLoading?: boolean;
}

/**
 * Badge showing subscription status
 * - Premium: gold badge
 * - Trial: gift badge with days left
 * - Free: nothing
 */
export function PremiumBadge({ subscription, isLoading }: PremiumBadgeProps) {
  if (isLoading) {
    return null;
  }

  if (!subscription) {
    return null;
  }

  // Premium (not trial)
  if (subscription.isPremium && !subscription.isTrialActive) {
    return (
      <Badge variant="secondary">
        Premium
      </Badge>
    );
  }

  // Trial active
  if (subscription.isTrialActive && subscription.trialDaysLeft !== null) {
    return (
      <Badge variant="warning">
        Trial: {subscription.trialDaysLeft}d
      </Badge>
    );
  }

  // Free - don't show anything
  return null;
}
