import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { BookingDto, CreateBookingResultDto, IDEMPOTENCY_REPLAYED_HEADER } from '@roombook/contract';
import { ServerResponse } from 'http';
import { map, Observable } from 'rxjs';

@Injectable()
export class IdempotencyReplayedInterceptor implements NestInterceptor<CreateBookingResultDto, BookingDto> {
  intercept(context: ExecutionContext, next: CallHandler<CreateBookingResultDto>): Observable<BookingDto> {
    const response = context.switchToHttp().getResponse<ServerResponse>();
    return next.handle().pipe(
      map((result) => {
        if (result.replayed) {
          response.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
        }
        return result.booking;
      }),
    );
  }
}
