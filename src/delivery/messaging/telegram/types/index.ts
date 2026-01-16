import { Context, NarrowedContext } from 'telegraf';
import { Message, Update, CallbackQuery } from 'telegraf/types';
import { VoiceProcessingModule } from '../../../../modules/voiceProcessing/voiceProcessingModule';
import { TransactionModule } from '../../../../modules/transaction/transactionModule';

/**
 * Modules available in bot context
 */
export interface BotModules {
  voiceModule: VoiceProcessingModule;
  transactionModule: TransactionModule;
}

/**
 * User session data
 */
export interface UserSession {
  userId: string;
  userName: string;
  lastTransactionId?: string;
  language: 'ru';
  pendingAction?: PendingAction;
}

/**
 * Pending action types for multi-step flows
 */
export type PendingAction =
  | { type: 'awaiting_category'; amount: number }
  | { type: 'awaiting_amount'; category: string }
  | { type: 'awaiting_confirmation'; transactionId: string };

/**
 * Extended bot context with modules and session
 */
export interface BotContext extends Context {
  modules: BotModules;
  session: UserSession;
}

/**
 * Context for text message handlers
 */
export type TextMessageContext = NarrowedContext<BotContext, Update.MessageUpdate<Message.TextMessage>>;

/**
 * Context for voice message handlers
 */
export type VoiceMessageContext = NarrowedContext<BotContext, Update.MessageUpdate<Message.VoiceMessage>>;

/**
 * Context for callback query handlers
 */
export type CallbackContext = NarrowedContext<BotContext, Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

/**
 * Transaction data from processing
 */
export interface ProcessedTransaction {
  id: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  merchant?: string;
  confidence?: number;
  description?: string;
}

/**
 * Quick category for inline keyboard
 */
export interface QuickCategory {
  id: string;
  emoji: string;
  name: string;
}

/**
 * Statistics summary for commands
 */
export interface StatsSummary {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
}

/**
 * Category breakdown for stats
 */
export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

/**
 * Budget status for /budget command
 */
export interface BudgetStatus {
  id: string;
  name: string;
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'ok' | 'warning' | 'exceeded';
}
