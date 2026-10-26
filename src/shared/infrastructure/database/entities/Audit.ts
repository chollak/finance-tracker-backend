import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The spending audit of a month (FT-131): the candidates the rules found, with what the person decided about each
 * (`candidates`, a JSON array), and the audit day — the first «Готово» (`done_on`). One per user and month. Until the
 * first mark or «Готово» the candidates are found again on every read; `frozen` keeps them from then on (FT-142).
 * `version` grows with every write, so two taps at once never lose a mark.
 */
@Entity('audits')
@Index('IDX_audits_user_month', ['userId', 'month'], { unique: true })
export class Audit {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column()
  month!: string;

  @Column('text')
  candidates!: string;

  @Column('date', { name: 'done_on', nullable: true })
  doneOn!: string | null;

  @Column({ default: false })
  frozen!: boolean;

  @Column('integer', { default: 0 })
  version!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
