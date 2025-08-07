export interface Transaction {
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  userName?: string;
}

export interface TelegramWebApp {
  ready: () => void;
  close: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}