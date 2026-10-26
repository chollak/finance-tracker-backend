import type { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { UserInitializer } from './UserInitializer';
import { HydrationGate } from './HydrationGate';
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { Toaster } from '@/shared/ui/sonner';
import { ThemeController } from './ThemeController';
import { ThemeSettingsSync } from '@/features/theme-choice';
import { OfflineSync } from './OfflineSync';

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
          {/* Without a connection: the reads kept on the device and the outbox of records (FT-129) */}
          <OfflineSync />
          {/* The theme the user saved (FT-125) once the settings are read */}
          <ThemeSettingsSync />
          {children}
        </HydrationGate>
        <Toaster position="top-center" richColors />
      </QueryProvider>
    </ErrorBoundary>
  );
}
