import { useLocation } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { backControl, currentTelegramBackButton, useGoBack } from '@/shared/lib/navigation';
import { Button } from './button';

/**
 * The screen's own «Назад» (Button.md: secondary round, 44×44, on `card` in a header). Inside Telegram it
 * renders nothing — Telegram's BackButton takes its place (the app shell shows it) — and on Home there is
 * no back at all. A press returns to the previous app screen, or to the parent one when the screen was
 * opened directly. `onClick` replaces that press — the showcase uses it to show the button without leaving.
 * `label` names where it leads when the screen always returns to one place: «Ко всем категориям».
 */
export function BackButton({ className, onClick, label = 'Назад' }: { className?: string; onClick?: () => void; label?: string }) {
  const { pathname } = useLocation();
  const goBack = useGoBack();

  if (backControl(pathname, currentTelegramBackButton() !== null) !== 'own') return null;

  return (
    <Button variant="round-secondary" aria-label={label} onClick={onClick ?? goBack} className={cn('bg-card', className)}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M12.5 4.5 7 10l5.5 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Button>
  );
}
