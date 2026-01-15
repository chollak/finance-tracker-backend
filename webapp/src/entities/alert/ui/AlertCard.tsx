import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { AlertCircle, AlertTriangle, Bell, Info, X } from 'lucide-react';
import type { AlertViewModel } from '../model/types';

// Map icon names to Lucide components
const iconComponents = {
  AlertCircle,
  AlertTriangle,
  Bell,
  Info,
} as const;

interface AlertCardProps {
  alert: AlertViewModel;
  onDismiss?: () => void;
}

/**
 * Alert card component
 * Uses ViewModel - no formatting logic in UI!
 */
export function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const IconComponent = iconComponents[alert._iconName];

  return (
    <Alert className={alert._severityBg}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <IconComponent className={`h-5 w-5 flex-shrink-0 ${alert._iconColor}`} />

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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  );
}
