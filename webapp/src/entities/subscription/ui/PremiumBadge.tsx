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
      <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
        Premium
      </Badge>
    );
  }

  // Trial active
  if (subscription.isTrialActive && subscription.trialDaysLeft !== null) {
    return (
      <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30">
        Trial: {subscription.trialDaysLeft}d
      </Badge>
    );
  }

  // Free - don't show anything
  return null;
}
