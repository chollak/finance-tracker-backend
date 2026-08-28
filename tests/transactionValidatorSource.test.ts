/**
 * Валидатор собирает Transaction по белому списку полей. Поля, которого
 * в списке нет, молча не доезжают до репозитория — ответ при этом успешный.
 *
 * Ровно так терялся source у записей, созданных формой: клиент его слал,
 * сервер отвечал 201, а в базе оставался NULL. То есть поле, заведённое ради
 * различения каналов, каналы бы и не различало.
 */
import { TransactionValidator } from '../src/shared/application/validation/transactionValidator';

const base = {
  amount: 45000,
  category: 'taxi',
  description: 'Такси',
  type: 'expense',
  userId: 'u-1',
};

describe('канал захвата в валидаторе', () => {
  it('доезжает до собранной транзакции', () => {
    const result = TransactionValidator.validate({ ...base, source: 'webapp' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBe('webapp');
  });

  it('без канала остаётся пустым, а не выдумывается', () => {
    // Запись могла прийти откуда угодно; врать про источник хуже, чем молчать.
    const result = TransactionValidator.validate(base);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBeUndefined();
  });

  it('неизвестный канал отвергается, а не пишется в базу', () => {
    const result = TransactionValidator.validate({ ...base, source: 'ерунда' });

    expect(result.success).toBe(false);
  });
});
