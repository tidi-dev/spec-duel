import { ConfirmationStatusEnum } from '../confirmation-status.enum';

export class ConfirmationJobDto {
  bookingId: string;
}

export class RecordConfirmationResultDto {
  bookingId: string;
  status: ConfirmationStatusEnum;
  attempts: number;
}
