import { formatTransactionMessage } from '../src/delivery/messaging/telegram/formatters';
import { ProcessedTransaction } from '../src/delivery/messaging/telegram/types';

describe('Telegram transaction formatter', () => {
  it('formats an auto-saved expense with a daily next-action hint and totals', () => {
    const tx: ProcessedTransaction = {
      id: 'tx-1',
      amount: 45000,
      category: 'coffee',
      type: 'expense',
      semanticType: 'expense',
      description: 'кофе',
      confidence: 0.95,
    };

    const message = formatTransactionMessage(tx, 'кофе 45000', false, false, 90000, 712000);

    expect(message).toContain('✅ <b>Сохранено</b>');
    expect(message).toContain('💸 Сумма: <b>45 000 UZS</b>');
    expect(message).toContain('💸 Смысл: Расход');
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

  it('makes own transfers explicit and says they do not count as expenses', () => {
    const tx: ProcessedTransaction = {
      id: 'tx-transfer',
      amount: 500000,
      category: 'transfer',
      type: 'expense',
      semanticType: 'own_transfer',
      description: 'перевел на Alif',
    };

    const message = formatTransactionMessage(tx, 'перевел 500000 на Alif', false);

    expect(message).toContain('↔️ Смысл: Перевод себе');
    expect(message).toContain('ℹ️ Не входит в расходы');
  });

  it('surfaces needsReview so the user knows to correct it in Mini App', () => {
    const tx: ProcessedTransaction = {
      id: 'tx-review',
      amount: 400000,
      category: 'restaurants',
      type: 'expense',
      semanticType: 'group_payment',
      needsReview: true,
    };

    const message = formatTransactionMessage(tx, 'оплатил за всех ужин 400000', false);

    expect(message).toContain('👥 Смысл: Групповой платёж');
    expect(message).toContain('ℹ️ Проверь свою долю');
    expect(message).toContain('⚠️ Нужно проверить в Mini App');
  });
});
