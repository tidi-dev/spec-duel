import type { ConfirmationStatusEnum } from '@roombook/contract';
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bookings' })
@Check('CK_bookings_time_range', '"ends_at" > "starts_at"')
@Check('CK_bookings_confirmation_status', `"confirmation_status" IN ('PENDING', 'SENT', 'FAILED')`)
@Index('IDX_bookings_starts_at', ['startsAt', 'id'])
@Index('IDX_bookings_room_id_starts_at', ['roomId', 'startsAt', 'id'])
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

  @Column({ name: 'confirmation_status', type: 'varchar', length: 10, default: 'PENDING' })
  confirmationStatus: ConfirmationStatusEnum;

  @Column({ name: 'confirmation_attempts', type: 'integer', default: 0 })
  confirmationAttempts: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
