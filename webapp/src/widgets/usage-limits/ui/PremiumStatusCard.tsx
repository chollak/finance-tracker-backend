import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Crown, Infinity, Sparkles } from 'lucide-react';
import type { SubscriptionStatus } from '@/entities/subscription';

interface PremiumStatusCardProps {
  subscription: SubscriptionStatus;
}

/**
 * Premium Status Card
 * Shows subscription status for premium users
 * Features semantic warning tones and refined minimal design
 */
export function PremiumStatusCard({ subscription }: PremiumStatusCardProps) {
  const { subscriptionDaysLeft, isTrialActive, trialDaysLeft } = subscription;

  // Determine status display
  const isTrial = isTrialActive && trialDaysLeft !== null;
  const daysLeft = isTrial ? trialDaysLeft : subscriptionDaysLeft;

  return (
    <Card className="relative overflow-hidden rounded-3xl border-0 bg-warning-muted/45">
      {/* Subtle decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-warning/10 -translate-y-1/2 translate-x-1/2" />

      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-warning text-warning-foreground flex items-center justify-center shadow-sm">
              <Crown className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-semibold text-foreground">
              Premium
            </CardTitle>
          </div>
          <Badge
            className={
              isTrial
                ? 'bg-warning-muted text-warning border-warning/30 hover:bg-warning-muted'
                : 'bg-secondary text-secondary-foreground border-border hover:bg-secondary/80'
            }
          >
            {isTrial ? (
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Trial
              </span>
            ) : (
              'Active'
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 relative">
        {/* Benefits list */}
        <div className="space-y-2.5">
          <BenefitRow label="Транзакции" />
          <BenefitRow label="Голосовой ввод" />
          <BenefitRow label="Активные долги" />
        </div>

        {/* Expiration info */}
        {daysLeft !== null && daysLeft > 0 && (
          <p className="text-xs text-warning pt-1">
            {isTrial ? 'Trial истекает' : 'Истекает'} через{' '}
            <span className="font-medium text-warning">
              {daysLeft} {getDaysWord(daysLeft)}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Single benefit row with infinity icon
 */
function BenefitRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <div className="w-5 h-5 rounded-md bg-warning-muted flex items-center justify-center">
        <Infinity className="w-3.5 h-3.5 text-warning" />
      </div>
      <span className="text-foreground/80">{label}</span>
    </div>
  );
}

/**
 * Get correct Russian word form for days
 */
function getDaysWord(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'дней';
  if (lastOne === 1) return 'день';
  if (lastOne >= 2 && lastOne <= 4) return 'дня';
  return 'дней';
}
