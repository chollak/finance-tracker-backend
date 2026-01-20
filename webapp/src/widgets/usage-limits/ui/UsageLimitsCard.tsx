import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { useSubscription, UsageBar } from '@/entities/subscription';
import { useUserStore } from '@/entities/user/model/store';
import { PremiumStatusCard } from './PremiumStatusCard';
import { CreditCard, Mic, Wallet } from 'lucide-react';

// Bot username from environment variable
const BOT_USERNAME = import.meta.env.VITE_TG_BOT_USERNAME || 'FinanceTrackerAppBot';

/**
 * Usage limits card widget
 * Shows current usage vs limits for free users
 * Shows premium status card for premium users
 */
export function UsageLimitsCard() {
  const userId = useUserStore((state) => state.userId);
  const { data: subscription, isLoading } = useSubscription(userId);

  // Loading state
  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Show premium status card for premium users
  if (subscription?.isPremium) {
    return <PremiumStatusCard subscription={subscription} />;
  }

  // Handle upgrade button click - open Telegram bot
  const handleUpgrade = () => {
    window.open(`https://t.me/${BOT_USERNAME}?start=premium`, '_blank');
  };

  const limits = subscription?.limits;

  // Defensive rendering: if limits is undefined, show loading message
  if (!limits) {
    return (
      <Card className="rounded-3xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Лимиты</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Загрузка информации о лимитах...
          </p>
          <Button
            onClick={handleUpgrade}
            variant="outline"
            className="w-full"
            size="sm"
          >
            Снять лимиты
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Лимиты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <UsageBar
          label="Транзакции"
          icon={<CreditCard className="w-3.5 h-3.5" />}
          used={limits.transactions.used}
          limit={limits.transactions.limit}
        />
        <UsageBar
          label="Голосовые"
          icon={<Mic className="w-3.5 h-3.5" />}
          used={limits.voiceInputs.used}
          limit={limits.voiceInputs.limit}
        />
        <UsageBar
          label="Активные долги"
          icon={<Wallet className="w-3.5 h-3.5" />}
          used={limits.activeDebts.used}
          limit={limits.activeDebts.limit}
        />

        <Button
          onClick={handleUpgrade}
          variant="outline"
          className="w-full mt-2"
          size="sm"
        >
          Снять лимиты
        </Button>
      </CardContent>
    </Card>
  );
}
