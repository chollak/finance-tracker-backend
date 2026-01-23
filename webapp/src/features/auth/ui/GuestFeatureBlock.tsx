/**
 * Guest Feature Block
 * Shows a message when a feature is blocked for guest users
 */

import { Lock } from 'lucide-react';
import { TelegramLoginButton } from './TelegramLoginButton';
import { cn } from '@/shared/lib/utils';

interface GuestFeatureBlockProps {
  title: string;
  description: string;
  className?: string;
}

export function GuestFeatureBlock({
  title,
  description,
  className,
}: GuestFeatureBlockProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
    >
      {/* Icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold mb-2">{title}</h2>

      {/* Description */}
      <p className="text-muted-foreground mb-6 max-w-md">{description}</p>

      {/* Login Button */}
      <TelegramLoginButton variant="telegram" size="lg" />

      {/* Hint */}
      <p className="mt-4 text-xs text-muted-foreground">
        В гостевом режиме доступны только транзакции (локально)
      </p>
    </div>
  );
}
