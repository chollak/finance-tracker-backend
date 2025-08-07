export interface Transaction {
  id?: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  userName?: string;
  // Enhanced fields for learning
  merchant?: string;
  confidence?: number;
  originalText?: string;
  originalParsing?: {
    amount: number;
    category: string;
    type: 'income' | 'expense';
    merchant?: string;
    confidence?: number;
  };
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