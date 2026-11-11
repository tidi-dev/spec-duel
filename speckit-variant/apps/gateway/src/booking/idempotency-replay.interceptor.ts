import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { BookingDto, CreateBookingResultDto, IDEMPOTENCY_REPLAYED_HEADER } from '@roombook/contract';
import { ServerResponse } from 'node:http';
import { map, Observable } from 'rxjs';

@Injectable()
export class IdempotencyReplayInterceptor implements NestInterceptor<CreateBookingResultDto, BookingDto> {
  intercept(context: ExecutionContext, next: CallHandler<CreateBookingResultDto>): Observable<BookingDto> {
    return next.handle().pipe(
      map((result) => {
        if (result.replayed) {
          context.switchToHttp().getResponse<ServerResponse>().setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
        }
        return result.booking;
      }),
    );
  }
}
