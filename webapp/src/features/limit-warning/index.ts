import { toast } from 'sonner';
import type { SubscriptionStatus } from '@/entities/subscription';
import { plural, PLURALS } from '@/shared/lib/plural';

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
      return `Осталось ${remaining} ${pluralOf_transaction(remaining)} в этом месяце`;
    case 'voiceInputs':
      return `Осталось ${remaining} ${pluralOf_voiceInput(remaining)}`;
    case 'activeDebts':
      return `Можно добавить ещё ${remaining} ${pluralOf_debt(remaining)}`;
  }
}




const pluralOf_transaction = (n: number) => plural(n, PLURALS.transaction);
const pluralOf_voiceInput = (n: number) => plural(n, PLURALS.voiceInput);
const pluralOf_debt = (n: number) => plural(n, PLURALS.debt);
