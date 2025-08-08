import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Transaction } from './Transaction';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  color?: string; // Hex color code for UI

  @Column({ nullable: true })
  icon?: string; // Icon name or emoji

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isDefault!: boolean; // System default categories

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, user => user.categories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @OneToMany(() => Transaction, transaction => transaction.category)
  transactions!: Transaction[];
}