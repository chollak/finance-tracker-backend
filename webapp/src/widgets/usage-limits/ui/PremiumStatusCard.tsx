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
 * Features warm amber tones and refined minimal design
 */
export function PremiumStatusCard({ subscription }: PremiumStatusCardProps) {
  const { subscriptionDaysLeft, isTrialActive, trialDaysLeft } = subscription;

  // Determine status display
  const isTrial = isTrialActive && trialDaysLeft !== null;
  const daysLeft = isTrial ? trialDaysLeft : subscriptionDaysLeft;

  return (
    <Card className="rounded-3xl border-0 bg-gradient-to-br from-amber-50/80 via-amber-50/60 to-orange-50/40 overflow-hidden relative">
      {/* Subtle decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-200/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />

      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shadow-sm">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <CardTitle className="text-base font-semibold text-amber-950">
              Premium
            </CardTitle>
          </div>
          <Badge
            className={
              isTrial
                ? 'bg-purple-100 text-purple-700 border-purple-200/50 hover:bg-purple-100'
                : 'bg-amber-100 text-amber-700 border-amber-200/50 hover:bg-amber-100'
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
          <p className="text-xs text-amber-700/70 pt-1">
            {isTrial ? 'Trial истекает' : 'Истекает'} через{' '}
            <span className="font-medium text-amber-800">
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
      <div className="w-5 h-5 rounded-md bg-amber-100/80 flex items-center justify-center">
        <Infinity className="w-3.5 h-3.5 text-amber-600" />
      </div>
      <span className="text-amber-900/80">{label}</span>
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
