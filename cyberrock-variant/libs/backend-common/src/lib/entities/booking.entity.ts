// Type-only: the migration CLI loads entities through ts-node, which cannot resolve the workspace alias.
import type { ConfirmationStatusEnum } from '@roombook/contract';
import { Check, Column, CreateDateColumn, Entity, Exclusion, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const BOOKINGS_SPAN_CONSTRAINT = 'CHK_bookings_span';
export const BOOKINGS_ROOM_SPAN_CONSTRAINT = 'EXCL_bookings_room_span';

@Entity({ name: 'bookings' })
@Check(BOOKINGS_SPAN_CONSTRAINT, '"ends_at" > "starts_at"')
@Exclusion(BOOKINGS_ROOM_SPAN_CONSTRAINT, 'USING gist ("room_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)')
export class BookingEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'PK_bookings_id' })
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'title', type: 'varchar', length: 120 })
  title: string;

  @Column({ name: 'organizer_email', type: 'varchar', length: 320 })
  organizerEmail: string;

  @Column({ name: 'starts_at', type: 'timestamp with time zone' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamp with time zone' })
  endsAt: Date;

  @Column({ name: 'confirmation_status', type: 'varchar', length: 16, default: 'PENDING' })
  confirmationStatus: ConfirmationStatusEnum;

  @Column({ name: 'confirmation_attempts', type: 'integer', default: 0 })
  confirmationAttempts: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
