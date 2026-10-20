import { parseAmountReply } from '../src/delivery/messaging/telegram/utils/amountReply';

/**
 * «Сумму» under a record asks «Напишите новую сумму — например, 150к.» (FT-122): the next text counts
 * only if it is an amount, written the way people write sums in the chat.
 */
describe('amount reply (FT-122)', () => {
  const sumExpense = { currency: 'UZS' as const };
  const usd = { currency: 'USD' as const };

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
    // Not when the unit is written
    expect(parseAmountReply('28 сум', sumExpense)).toEqual({ kind: 'amount', amountMinor: 2_800, currency: 'UZS' });
    // A fraction too: there are no sums under one сум
    expect(parseAmountReply('1,5', sumExpense)).toEqual({ kind: 'amount', amountMinor: 150_000, currency: 'UZS', written: '1,5' });
    expect(parseAmountReply('0.5', sumExpense)).toEqual({ kind: 'amount', amountMinor: 50_000, currency: 'UZS', written: '0.5' });
  });

  it('reads «45» as 45 000 сум whatever the type of the record, as on the board', () => {
    // The parser does not ask for the type: an income of 45 сум is no more real than an expense
    expect(parseAmountReply('45', { currency: 'UZS' })).toEqual({ kind: 'amount', amountMinor: 4_500_000, currency: 'UZS', written: '45' });
  });

  it('reads «к», «тыс», «млн» without a unit as сум, also under a dollar record', () => {
    expect(parseAmountReply('150к', usd)).toEqual({ kind: 'amount', amountMinor: 15_000_000, currency: 'UZS' });
    expect(parseAmountReply('1,5 млн', usd)).toEqual({ kind: 'amount', amountMinor: 150_000_000, currency: 'UZS' });
    // A bare number under a dollar record stays dollars, and is not thousands
    expect(parseAmountReply('150', usd)).toEqual({ kind: 'amount', amountMinor: 15_000, currency: 'USD' });
  });

  it('takes an account word with the amount: «18к нал», «наличными 18 000», «18к картой»', () => {
    expect(parseAmountReply('18к нал', sumExpense)).toEqual({ kind: 'amount', amountMinor: 1_800_000, currency: 'UZS', account: 'cash' });
    expect(parseAmountReply('наличными 18 000', sumExpense)).toEqual({ kind: 'amount', amountMinor: 1_800_000, currency: 'UZS', account: 'cash' });
    expect(parseAmountReply('18к картой', sumExpense)).toEqual({ kind: 'amount', amountMinor: 1_800_000, currency: 'UZS', account: 'card' });
    expect(parseAmountReply('18 по карте', sumExpense)).toEqual({ kind: 'amount', amountMinor: 1_800_000, currency: 'UZS', written: '18', account: 'card' });
    expect(parseAmountReply('60$ налом', sumExpense)).toEqual({ kind: 'amount', amountMinor: 6_000, currency: 'USD', account: 'cash' });
    // Both named says nothing about the account
    expect(parseAmountReply('18к нал картой', sumExpense)).toEqual({ kind: 'amount', amountMinor: 1_800_000, currency: 'UZS' });
  });

  it('reads dollars with cents, in a dollar record or written with «$»', () => {
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
    for (const text of ['такси 18к', 'обед', 'не 25, а 28', 'нал', '', '/undo', '25 и 30', '60$ сум', 'картошка 5к']) {
      expect(parseAmountReply(text, sumExpense)).toBeNull();
    }
  });
});
