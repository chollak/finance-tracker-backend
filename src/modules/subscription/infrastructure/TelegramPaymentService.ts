/**
 * TelegramPaymentService
 * Handles Telegram Stars payment operations
 */

import { Telegram } from 'telegraf';
import { SUBSCRIPTION_PRICE_STARS, MONTHLY_DURATION_DAYS } from '../domain/subscription';

export interface InvoicePayload {
  userId: string;
  type: 'premium';
}

export interface SendInvoiceOptions {
  chatId: number;
  userId: string;
}

export class TelegramPaymentService {
  constructor(private telegram: Telegram) {}

  /**
   * Send premium subscription invoice to user
   */
  async sendPremiumInvoice(options: SendInvoiceOptions): Promise<void> {
    const { chatId, userId } = options;

    const payload: InvoicePayload = {
      userId,
      type: 'premium',
    };

    await this.telegram.sendInvoice(chatId, {
      title: '⭐ Finance Tracker Premium',
      description: `Безлимитный доступ на ${MONTHLY_DURATION_DAYS} дней:\n` +
        '✅ Безлимит транзакций\n' +
        '✅ Безлимит голосовых\n' +
        '✅ Безлимит долгов\n' +
        '✅ Полная аналитика',
      payload: JSON.stringify(payload),
      provider_token: '', // CRITICAL: Empty string for Telegram Stars
      currency: 'XTR', // Telegram Stars currency
      prices: [
        {
          label: 'Premium подписка (30 дней)',
          amount: SUBSCRIPTION_PRICE_STARS,
        },
      ],
    });
  }

  /**
   * Parse invoice payload from pre_checkout_query or successful_payment
   */
  parsePayload(payloadString: string): InvoicePayload | null {
    try {
      return JSON.parse(payloadString) as InvoicePayload;
    } catch {
      console.error('Failed to parse invoice payload:', payloadString);
      return null;
    }
  }

  /**
   * Refund a payment (if needed)
   * Note: Telegram Stars refunds are processed through Telegram
   */
  async refundPayment(
    userId: number,
    telegramPaymentChargeId: string
  ): Promise<boolean> {
    try {
      // Use type assertion for Telegram Bot API method not in telegraf types
      await (this.telegram.callApi as (method: string, params: object) => Promise<boolean>)(
        'refundStarPayment',
        {
          user_id: userId,
          telegram_payment_charge_id: telegramPaymentChargeId,
        }
      );
      return true;
    } catch (error) {
      console.error('Failed to refund payment:', error);
      return false;
    }
  }
}
