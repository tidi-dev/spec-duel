// Type-only: the migration CLI loads entities through ts-node, which cannot resolve the workspace alias.
import type { BookingDto } from '@roombook/contract';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export const IDEMPOTENCY_KEYS_PRIMARY_KEY = 'PK_idempotency_keys_key';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKeyEntity {
  @PrimaryColumn({ name: 'key', type: 'uuid', primaryKeyConstraintName: IDEMPOTENCY_KEYS_PRIMARY_KEY })
  key: string;

  @Column({ name: 'fingerprint', type: 'char', length: 64 })
  fingerprint: string;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody: BookingDto;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
