import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** A user's category (FT-099). Names are unique per user and type regardless of case (`name_key`). */
@Entity('categories')
@Index('IDX_categories_user_type_name', ['userId', 'type', 'nameKey'], { unique: true })
@Index('IDX_categories_user_type_preset', ['userId', 'type', 'presetKey'], { unique: true })
export class Category {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column()
  type!: string;

  @Column('varchar', { length: 40 })
  name!: string;

  @Column({ name: 'name_key' })
  nameKey!: string;

  @Column()
  color!: string;

  @Column({ name: 'is_hidden', default: false })
  isHidden!: boolean;

  @Column({ name: 'is_other', default: false })
  isOther!: boolean;

  @Column('integer', { name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column('varchar', { name: 'preset_key', nullable: true })
  presetKey!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
