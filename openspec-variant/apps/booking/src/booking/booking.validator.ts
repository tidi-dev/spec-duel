import { Injectable } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum } from '@roombook/contract';

@Injectable()
export class BookingValidator {
  assertTimeOrder(startsAt: Date, endsAt: Date): void {
    if (endsAt.getTime() <= startsAt.getTime()) {
      ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'endsAt must be later than startsAt');
    }
  }
}
