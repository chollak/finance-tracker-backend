/**
 * Telegram Login Button
 * Allows guest users to connect their Telegram account
 */

import { useState } from 'react';
import { Loader2, Smartphone, CloudOff, Send } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useIsGuest, useUserStore } from '@/entities/user/model/store';
import { cn } from '@/shared/lib/utils';

interface TelegramLoginButtonProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'telegram';
  size?: 'default' | 'sm' | 'lg';
}

// Bot username - should match your Telegram bot
const BOT_USERNAME = import.meta.env.VITE_TG_BOT_USERNAME || 'FinanceTrackerAppBot';

export function TelegramLoginButton({
  className,
  variant = 'default',
  size = 'default',
}: TelegramLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isGuest = useIsGuest();
  const { userId: guestUserId } = useUserStore();

  const handleLogin = async () => {
    setIsLoading(true);

    try {
      // Store current URL to return after auth
      const returnUrl = window.location.href;

      // Create deep link to bot
      // The bot will open the WebApp with Telegram user context
      const startParam = encodeURIComponent(
        JSON.stringify({
          action: 'auth',
          returnUrl,
          guestId: guestUserId,
        })
      );

      // Open Telegram with bot deep link
      window.location.href = `https://t.me/${BOT_USERNAME}?start=${startParam}`;
    } catch (error) {
      console.error('[TelegramLoginButton] Error:', error);
      setIsLoading(false);
    }
  };

  // Only show for guest users
  if (!isGuest) {
    return null;
  }

  // Telegram branded button style
  const telegramStyles = variant === 'telegram'
    ? 'bg-[#0088cc] hover:bg-[#0077b5] text-white border-0 shadow-sm'
    : '';

  return (
    <Button
      variant={variant === 'telegram' ? 'default' : variant}
      size={size}
      onClick={handleLogin}
      disabled={isLoading}
      className={cn('gap-2', telegramStyles, className)}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      Войти через Telegram
    </Button>
  );
}

/**
 * Guest Mode Banner
 * Shows a banner encouraging guest users to connect Telegram
 * Clean, minimal design with Russian text
 */
export function GuestModeBanner({ className }: { className?: string }) {
  const isGuest = useIsGuest();
  const { pendingChangesCount } = useUserStore();

  if (!isGuest) return null;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-r from-muted/50 to-muted/30 p-4',
        className
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#0088cc]" />
        <div className="absolute -bottom-2 -left-2 h-16 w-16 rounded-full bg-[#0088cc]" />
      </div>

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <CloudOff className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground">
              Гостевой режим
            </h3>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Smartphone className="mr-1 h-3 w-3" />
              Локально
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Данные хранятся только на этом устройстве.
            {pendingChangesCount > 0 && (
              <span className="text-foreground font-medium">
                {' '}У вас {pendingChangesCount} {pendingChangesCount === 1 ? 'транзакция' : pendingChangesCount < 5 ? 'транзакции' : 'транзакций'} для синхронизации.
              </span>
            )}
          </p>
        </div>

        {/* Button */}
        <TelegramLoginButton
          variant="telegram"
          size="sm"
          className="shrink-0 w-full sm:w-auto"
        />
      </div>
    </div>
  );
}
