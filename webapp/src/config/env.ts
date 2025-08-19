// Environment configuration for development vs production

declare const __DEV_MODE__: boolean;
declare const __API_BASE__: string;

export const config = {
  // Development mode flag
  isDevelopment: typeof __DEV_MODE__ !== 'undefined' ? __DEV_MODE__ : false,
  
  // API base URL
  apiBase: typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : '/api',
  
  // Development user ID for testing (replace with your Telegram user ID)
  devUserId: '131184740',
  
  // Telegram WebApp environment detection
  isTelegramWebApp: typeof window !== 'undefined' && window.Telegram?.WebApp,
  
  // Get user ID (from Telegram WebApp or fallback to dev user)
  getUserId(): string {
    if (this.isTelegramWebApp) {
      return window.Telegram.WebApp.initDataUnsafe?.user?.id?.toString() || this.devUserId;
    }
    return this.devUserId;
  },
  
  // Get theme from Telegram WebApp or default
  getTheme(): 'light' | 'dark' {
    if (this.isTelegramWebApp) {
      return window.Telegram.WebApp.colorScheme === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  },
  
  // Development logging
  log: {
    debug: (message: string, data?: any) => {
      if (config.isDevelopment) {
        console.log(`[DEBUG] ${message}`, data || '');
      }
    },
    info: (message: string, data?: any) => {
      if (config.isDevelopment) {
        console.info(`[INFO] ${message}`, data || '');
      }
    },
    warn: (message: string, data?: any) => {
      console.warn(`[WARN] ${message}`, data || '');
    },
    error: (message: string, data?: any) => {
      console.error(`[ERROR] ${message}`, data || '');
    }
  }
};

// Telegram WebApp type definitions
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
          };
        };
        colorScheme: 'light' | 'dark';
        ready(): void;
        expand(): void;
        close(): void;
      };
    };
  }
}