import type { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      {children}
    </QueryProvider>
  );
}
