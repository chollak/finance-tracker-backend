import { useEffect } from 'react';

/**
 * Hook for theme management
 * Currently only supports light theme for stability in Telegram WebApp
 */
export function useTheme() {
  // Always apply light theme on mount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('light');
    root.classList.remove('dark');
  }, []);

  return {
    theme: 'light' as const,
    setTheme: () => {}, // No-op - only light theme supported
    resolvedTheme: 'light' as const,
    isDark: false,
  };
}
