export type TransactionType = 'expense' | 'income' | 'transfer';

interface Schema<T> {
  parse(value: unknown): T;
}

class OptionalSchema<T> implements Schema<T | undefined> {
  constructor(private readonly inner: Schema<T>) {}

  parse(value: unknown): T | undefined {
    if (value === undefined) return undefined;
    return this.inner.parse(value);
  }
}

class StringSchema implements Schema<string> {
  private pattern?: RegExp;
  private maxLength?: number;

  regex(regex: RegExp): this {
    this.pattern = regex;
    return this;
  }

  max(len: number): this {
    this.maxLength = len;
    return this;
  }

  optional(): Schema<string | undefined> {
    return new OptionalSchema(this);
  }

  parse(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Expected string');
    }
    if (this.pattern && !this.pattern.test(value)) {
      throw new Error('Invalid string format');
    }
    if (this.maxLength !== undefined && value.length > this.maxLength) {
      throw new Error('String too long');
    }
    return value;
  }
}

class NumberSchema implements Schema<number> {
  parse(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error('Expected number');
    }
    return value;
  }
}

class EnumSchema<T extends string> implements Schema<T> {
  constructor(private readonly values: readonly T[]) {}

  parse(value: unknown): T {
    if (typeof value !== 'string' || !this.values.includes(value as T)) {
      throw new Error('Invalid enum value');
    }
    return value as T;
  }
}

class ObjectSchema<T extends Record<string, any>> implements Schema<T> {
  constructor(private readonly shape: { [K in keyof T]: Schema<T[K]> }) {}

  parse(value: unknown): T {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Expected object');
    }
    const result: Record<string, any> = {};
    const input = value as Record<string, unknown>;
    for (const key of Object.keys(this.shape)) {
      result[key] = this.shape[key as keyof T].parse(input[key]);
    }
    return result as T;
  }
}

export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  enum: <T extends string>(vals: readonly T[]) => new EnumSchema(vals),
  object: <T extends Record<string, any>>(shape: { [K in keyof T]: Schema<T[K]> }) => new ObjectSchema<T>(shape),
};

export const transactionSchema = z.object({
  amount: z.number(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  type: z.enum(['expense', 'income', 'transfer'] as const),
  account: z.string(),
  category: z.string(),
  note: z.string().max(200).optional(),
});

export class TransactionDTO {
  readonly amount: number;

  readonly currency: string;

  readonly type: TransactionType;

  readonly account: string;

  readonly category: string;

  readonly note?: string;

  private constructor(props: TransactionDTO) {
    this.amount = props.amount;
    this.currency = props.currency;
    this.type = props.type;
    this.account = props.account;
    this.category = props.category;
    this.note = props.note;
  }

  static fromRaw(input: string): TransactionDTO {
    const parsedInput = JSON.parse(input);
    const data = transactionSchema.parse(parsedInput);
    return new TransactionDTO(data);
  }
}

export { Schema };
