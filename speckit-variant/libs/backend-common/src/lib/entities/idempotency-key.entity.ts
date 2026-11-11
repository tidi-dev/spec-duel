import type { BookingDto } from '@roombook/contract';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKeyEntity {
  @PrimaryColumn({ name: 'key', type: 'uuid', primaryKeyConstraintName: 'PK_idempotency_keys_key' })
  key: string;

  @Column({ name: 'request_fingerprint', type: 'character', length: 64 })
  requestFingerprint: string;

  @Column({ name: 'response_status', type: 'smallint' })
  responseStatus: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody: BookingDto;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
