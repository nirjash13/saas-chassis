import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'impersonation_sessions', schema: 'iam' })
export class ImpersonationSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId!: string;

  @Column({ name: 'target_user_id', type: 'uuid' })
  targetUserId!: string;

  @Column({ name: 'target_tenant_id', type: 'uuid' })
  targetTenantId!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'admin_user_id' })
  adminUser!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'target_user_id' })
  targetUser!: User;

  get isActive(): boolean {
    return this.endedAt === null && new Date() < this.expiresAt;
  }
}
