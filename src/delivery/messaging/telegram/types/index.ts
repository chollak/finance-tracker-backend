import { Context, NarrowedContext } from 'telegraf';
import { Message, Update, CallbackQuery } from 'telegraf/types';
import { VoiceProcessingModule } from '../../../../modules/voiceProcessing/voiceProcessingModule';
import { QuickCaptureModule } from '../../../../modules/quickCapture/quickCaptureModule';
import { TransactionModule } from '../../../../modules/transaction/transactionModule';
import { BudgetModule } from '../../../../modules/budget/budgetModule';
import { UserModule } from '../../../../modules/user/userModule';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { CategoryModule } from '../../../../modules/category/categoryModule';
import { AccountModule } from '../../../../modules/account/accountModule';
import { BotMessageModule } from '../../../../modules/botMessage/botMessageModule';

/**
 * Modules available in bot context
 */
export interface BotModules {
  voiceModule: VoiceProcessingModule;
  /** Shared capture boundary — the text handler goes through this, not through the parser directly. */
  quickCaptureModule: QuickCaptureModule;
  transactionModule: TransactionModule;
  budgetModule: BudgetModule;
  userModule: UserModule;
  subscriptionModule?: SubscriptionModule;
  /** The user's categories (FT-099/FT-100): quick-add keyboard, labels, the category picker (FT-122). */
  categoryModule?: CategoryModule;
  /** The user's accounts (FT-101): the account line of a confirmation and the account picker (FT-122). */
  accountModule?: AccountModule;
  /** Which records each confirmation shows (FT-122): its buttons and /undo survive a restart. */
  botMessageModule?: BotMessageModule;
}

/**
 * User session data
 */
export interface UserSession {
  userId: string;
  userName: string;
  language: 'ru';
  pendingAction?: PendingAction;
}

/**
 * Pending action types for multi-step flows
 */
export type PendingAction =
  | { type: 'awaiting_category'; amount: number }
  | { type: 'awaiting_amount'; category: string };

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
