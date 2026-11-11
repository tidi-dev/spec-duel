import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum } from '@roombook/contract';

export const raiseBookingOverlap = (): never =>
  ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, 'The room is already booked for that time');
