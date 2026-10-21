import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../transformers';

/**
 * Money moved between the user's own accounts or a balance set by hand (FT-104): a transfer (one
 * currency), an exchange (two currencies, at the deal rate) or an adjustment (the signed difference).
 * Never income or expense. Deleted softly, so «Отменить» brings it back.
 */
@Entity('account_moves')
@Index('IDX_account_moves_user', ['userId'])
@Index('IDX_account_moves_from', ['fromAccountId'])
@Index('IDX_account_moves_to', ['toAccountId'])
export class AccountMove {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column()
  kind!: string;

  @Column('varchar', { name: 'from_account_id', nullable: true })
  fromAccountId!: string | null;

  @Column({ name: 'to_account_id' })
  toAccountId!: string;

  @Column('bigint', { name: 'from_amount_minor', nullable: true, transformer: bigintNumber })
  fromAmountMinor!: number | null;

  @Column('bigint', { name: 'to_amount_minor', transformer: bigintNumber })
  toAmountMinor!: number;

  @Column('bigint', { name: 'deal_rate_minor', nullable: true, transformer: bigintNumber })
  dealRateMinor!: number | null;

  @Column('bigint', { name: 'cbu_rate_minor', nullable: true, transformer: bigintNumber })
  cbuRateMinor!: number | null;

  @Column('date')
  date!: string;

  @Column('varchar', { length: 200, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column('datetime', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
