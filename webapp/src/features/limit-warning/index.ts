import { toast } from 'sonner';
import type { SubscriptionStatus } from '@/entities/subscription';

// Bot username from environment variable
const BOT_USERNAME = import.meta.env.VITE_TG_BOT_USERNAME || 'FinanceTrackerAppBot';

// Warning threshold - 80% of limit
const WARNING_THRESHOLD = 0.8;

type LimitType = 'transactions' | 'voiceInputs' | 'activeDebts';

/**
 * Check usage limit and show warning toast if approaching or exceeded
 * Call this after creating a transaction, voice input, or debt
 */
export function checkAndShowLimitWarning(
  subscription: SubscriptionStatus | undefined,
  limitType: LimitType
): void {
  // Don't show for premium users or if no subscription data
  if (!subscription || subscription.isPremium) return;

  const limit = subscription.limits[limitType];

  // No limit data or unlimited
  if (!limit.limit) return;

  const percentage = limit.used / limit.limit;

  // Show error toast if limit exceeded
  if (percentage >= 1) {
    toast.error(getLimitExceededMessage(limitType), {
      duration: 5000,
      action: {
        label: 'Upgrade',
        onClick: () => openUpgradeLink(),
      },
    });
    return;
  }

  // Show warning toast if approaching limit (80%+)
  if (percentage >= WARNING_THRESHOLD) {
    toast.warning(getLimitWarningMessage(limitType, limit.remaining!), {
      duration: 4000,
    });
  }
}

/**
 * Show limit exceeded error toast
 * Call this when backend returns limit exceeded error
 */
export function showLimitExceededError(limitType?: LimitType): void {
  const message = limitType
    ? getLimitExceededMessage(limitType)
    : 'Достигнут лимит. Оформите Premium для безлимитного использования!';

  toast.error(message, {
    duration: 5000,
    action: {
      label: 'Upgrade',
      onClick: () => openUpgradeLink(),
    },
  });
}

/**
 * Open Telegram bot with premium command
 */
function openUpgradeLink(): void {
  window.open(`https://t.me/${BOT_USERNAME}?start=premium`, '_blank');
}

/**
 * Get localized message for limit exceeded
 */
function getLimitExceededMessage(type: LimitType): string {
  switch (type) {
    case 'transactions':
      return 'Достигнут лимит транзакций. Оформите Premium!';
    case 'voiceInputs':
      return 'Достигнут лимит голосового ввода. Оформите Premium!';
    case 'activeDebts':
      return 'Достигнут лимит активных долгов. Оформите Premium!';
  }
}

/**
 * Get localized warning message with remaining count
 */
function getLimitWarningMessage(type: LimitType, remaining: number): string {
  switch (type) {
    case 'transactions':
      return `Осталось ${remaining} ${getTransactionsWord(remaining)} в этом месяце`;
    case 'voiceInputs':
      return `Осталось ${remaining} ${getVoiceInputsWord(remaining)}`;
    case 'activeDebts':
      return `Можно добавить ещё ${remaining} ${getDebtsWord(remaining)}`;
  }
}

/**
 * Get correct Russian word form for transactions
 */
function getTransactionsWord(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'транзакций';
  if (lastOne === 1) return 'транзакция';
  if (lastOne >= 2 && lastOne <= 4) return 'транзакции';
  return 'транзакций';
}

/**
 * Get correct Russian word form for voice inputs
 */
function getVoiceInputsWord(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'голосовых сообщений';
  if (lastOne === 1) return 'голосовое сообщение';
  if (lastOne >= 2 && lastOne <= 4) return 'голосовых сообщения';
  return 'голосовых сообщений';
}

/**
 * Get correct Russian word form for debts
 */
function getDebtsWord(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'долгов';
  if (lastOne === 1) return 'долг';
  if (lastOne >= 2 && lastOne <= 4) return 'долга';
  return 'долгов';
}
