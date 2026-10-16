import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../transformers';

/** A user's account (FT-101): cash, card or dollars. Hidden, never deleted. */
@Entity('accounts')
@Index('IDX_accounts_user', ['userId'])
export class Account {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column('varchar', { length: 40 })
  name!: string;

  @Column()
  kind!: string;

  @Column()
  currency!: string;

  @Column('bigint', { name: 'opening_balance_minor', default: 0, transformer: bigintNumber })
  openingBalanceMinor!: number;

  @Column('date', { name: 'opening_date' })
  openingDate!: string;

  @Column({ name: 'is_hidden', default: false })
  isHidden!: boolean;

  @Column('integer', { name: 'sort_order', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
