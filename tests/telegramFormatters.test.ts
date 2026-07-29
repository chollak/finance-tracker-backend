import { formatTransactionMessage } from '../src/delivery/messaging/telegram/formatters';
import { ProcessedTransaction } from '../src/delivery/messaging/telegram/types';

describe('Telegram transaction formatter', () => {
  it('formats an auto-saved expense with a daily next-action hint and totals', () => {
    const tx: ProcessedTransaction = {
      id: 'tx-1',
      amount: 45000,
      category: 'coffee',
      type: 'expense',
      description: 'кофе',
      confidence: 0.95,
    };

    const message = formatTransactionMessage(tx, 'кофе 45000', false, false, 90000, 712000);

    expect(message).toContain('✅ <b>Сохранено</b>');
    expect(message).toContain('💸 Сумма: <b>45 000 UZS</b>');
    expect(message).toContain('🧾 Описание: кофе');
    expect(message).toContain('Сегодня: 90 000 UZS');
    expect(message).toContain('Месяц: 712 000 UZS');
    expect(message).toContain('Дальше: можно изменить, удалить или добавить ещё одну транзакцию кнопками ниже.');
  });

  it('does not add the next-action hint before low-confidence confirmation', () => {
    const tx: ProcessedTransaction = {
      id: 'tx-2',
      amount: 45000,
      category: 'coffee',
      type: 'expense',
      confidence: 0.4,
    };

    const message = formatTransactionMessage(tx, 'кофе maybe', true);

    expect(message).toContain('🤔 <b>Подтвердите</b>');
    expect(message).not.toContain('Дальше:');
  });
});
