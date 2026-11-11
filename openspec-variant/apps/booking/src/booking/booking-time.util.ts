import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum } from '@roombook/contract';

const TIME_PART = /[T\s](.*)$/i;
const ZONE_DESIGNATOR = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

export class BookingTimeUtil {
  static toDate(value: string): Date {
    const timePart = TIME_PART.exec(value)?.[1];
    const isZoneLess = timePart !== undefined && !ZONE_DESIGNATOR.test(timePart);
    const date = new Date(isZoneLess ? `${value}Z` : value);
    if (Number.isNaN(date.getTime())) {
      ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, `${value} cannot be resolved to an instant`);
    }
    return date;
  }
}
