import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Devtools из старого фронта не переносятся: там они подключались безусловно
 * и уезжали в продакшен-сборку.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Мини-апп открывают на секунды: перезапрашивать на каждый фокус
            // окна нет смысла, а трафик в дороге стоит денег.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Повторять отказ авторизации и упёршийся лимит бессмысленно:
              // initData не станет свежее, а лимит не отпустит за секунду.
              const status = (error as { statusCode?: number })?.statusCode;
              if (status === 401 || status === 403 || status === 429) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
