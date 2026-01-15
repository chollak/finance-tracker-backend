import { Loader2 } from 'lucide-react';

interface LoadingProps {
  text?: string;
  fullScreen?: boolean;
}

/**
 * Loading spinner component
 */
export function Loading({ text = 'Загрузка...', fullScreen = false }: LoadingProps) {
  if (fullScreen) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 p-4" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}
