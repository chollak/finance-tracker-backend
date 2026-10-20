import { parseAmountReply } from '../src/delivery/messaging/telegram/utils/amountReply';

/**
 * «Сумму» under a record asks «Напишите новую сумму — например, 150к.» (FT-122): the next text counts
 * only if it is an amount, written the way people write sums in the chat.
 */
describe('amount reply (FT-122)', () => {
  const sumExpense = { currency: 'UZS' as const, type: 'expense' as const };

  it.each([
    ['150к', 15_000_000],
    ['150 к', 15_000_000],
    ['150k', 15_000_000],
    ['150 тыс', 15_000_000],
    ['150 тысяч', 15_000_000],
    ['150000', 15_000_000],
    ['150 000', 15_000_000],
    ['150 000', 15_000_000],
    ['150.000', 15_000_000],
    ['150,000', 15_000_000],
    ['1,5 млн', 150_000_000],
    ['1.5млн', 150_000_000],
    ['2 млн', 200_000_000],
    ['145 000 сум', 14_500_000],
    ['  28000. ', 2_800_000],
  ])('«%s» is %i minor units of сум', (text, amountMinor) => {
    expect(parseAmountReply(text, sumExpense)).toEqual({ kind: 'amount', amountMinor, currency: 'UZS' });
  });

  it('reads a bare number under a thousand as thousands of сум, and says it did', () => {
    expect(parseAmountReply('28', sumExpense)).toEqual({ kind: 'amount', amountMinor: 2_800_000, currency: 'UZS', written: '28' });
    // Not when the unit is written, and not for income: small incomes are real
    expect(parseAmountReply('28 сум', sumExpense)).toEqual({ kind: 'amount', amountMinor: 2_800, currency: 'UZS' });
    expect(parseAmountReply('870', { currency: 'UZS', type: 'income' })).toEqual({ kind: 'amount', amountMinor: 87_000, currency: 'UZS' });
  });

  it('reads dollars with cents, in a dollar record or written with «$»', () => {
    const usd = { currency: 'USD' as const, type: 'expense' as const };
    expect(parseAmountReply('60', usd)).toEqual({ kind: 'amount', amountMinor: 6_000, currency: 'USD' });
    expect(parseAmountReply('60,50', usd)).toEqual({ kind: 'amount', amountMinor: 6_050, currency: 'USD' });
    expect(parseAmountReply('60$', sumExpense)).toEqual({ kind: 'amount', amountMinor: 6_000, currency: 'USD' });
    expect(parseAmountReply('$ 9.99', sumExpense)).toEqual({ kind: 'amount', amountMinor: 999, currency: 'USD' });
    expect(parseAmountReply('60 долларов', sumExpense)).toEqual({ kind: 'amount', amountMinor: 6_000, currency: 'USD' });
    expect(parseAmountReply('150к сум', usd)).toEqual({ kind: 'amount', amountMinor: 15_000_000, currency: 'UZS' });
  });

  it('refuses zero and negative amounts', () => {
    expect(parseAmountReply('0', sumExpense)).toEqual({ kind: 'not_positive' });
    expect(parseAmountReply('-5000', sumExpense)).toEqual({ kind: 'not_positive' });
  });

  it('refuses an amount beyond what a record can hold', () => {
    expect(parseAmountReply('99999999 млрд', sumExpense)).toEqual({ kind: 'too_big' });
  });

  it('is not an amount when the text says anything else', () => {
    for (const text of ['такси 18к', 'обед', 'не 25, а 28', '18к нал', '', '/undo', '25 и 30']) {
      expect(parseAmountReply(text, sumExpense)).toBeNull();
    }
  });
});
