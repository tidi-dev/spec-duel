import { ConfirmationStatusEnum } from '../confirmation-status.enum';

export class BookingDto {
  id: string;
  roomId: string;
  title: string;
  organizerEmail: string;
  startsAt: string;
  endsAt: string;
  confirmationStatus: ConfirmationStatusEnum;
  confirmationAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export class PagedBookingsDto {
  items: BookingDto[];
  total: number;
  page: number;
  limit: number;
}
