import { TransactionDTO } from '../src/core/dto/TransactionDTO';

describe('TransactionDTO', () => {
  it('creates instance from valid JSON', () => {
    const input = JSON.stringify({
      amount: 100,
      currency: 'USD',
      type: 'expense',
      account: 'cash',
      category: 'food',
      note: 'lunch',
    });
    const dto = TransactionDTO.fromRaw(input);
    expect(dto).toBeInstanceOf(TransactionDTO);
    expect(dto.amount).toBe(100);
    expect(dto.currency).toBe('USD');
  });

  it('throws on invalid currency', () => {
    const input = JSON.stringify({
      amount: 50,
      currency: 'usd',
      type: 'income',
      account: 'bank',
      category: 'salary',
    });
    expect(() => TransactionDTO.fromRaw(input)).toThrow();
  });
});
