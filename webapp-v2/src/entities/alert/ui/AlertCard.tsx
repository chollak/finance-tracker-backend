import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import type { AlertViewModel } from '../model/types';

interface AlertCardProps {
  alert: AlertViewModel;
  onDismiss?: () => void;
}

/**
 * Alert card component
 * Uses ViewModel - no formatting logic in UI!
 */
export function AlertCard({ alert, onDismiss }: AlertCardProps) {
  return (
    <Alert className={alert._severityBg}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span className="text-2xl">{alert._iconEmoji}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <AlertTitle className={alert._severityColor}>
            {alert.title}
          </AlertTitle>
          <AlertDescription className="mt-1">
            {alert.message}
          </AlertDescription>

          {/* Suggestions */}
          {alert.suggestions && alert.suggestions.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {alert.suggestions.map((suggestion: string, index: number) => (
                <li key={index}>• {suggestion}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Dismiss button (optional) */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </Alert>
  );
}
