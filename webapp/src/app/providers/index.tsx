import type { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { UserInitializer } from './UserInitializer';
import { HydrationGate } from './HydrationGate';
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { Toaster } from '@/shared/ui/sonner';
import { ThemeController } from './ThemeController';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeController />
      <QueryProvider>
        <HydrationGate>
          <UserInitializer />
          {children}
        </HydrationGate>
        <Toaster position="top-center" richColors />
      </QueryProvider>
    </ErrorBoundary>
  );
}
