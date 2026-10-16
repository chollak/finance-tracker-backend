import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../transformers';

/** Central Bank USD rates by date (FT-102); сум×100 per 1 USD. */
@Entity('fx_rates')
export class FxRate {
  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn()
  currency!: string;

  @Column('bigint', { name: 'rate_minor', transformer: bigintNumber })
  rateMinor!: number;

  @Column({ default: 'cbu' })
  source!: string;

  @Column('datetime', { name: 'fetched_at' })
  fetchedAt!: Date;
}
