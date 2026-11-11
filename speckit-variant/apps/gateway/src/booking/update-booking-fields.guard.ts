import { CanActivate, ExecutionContext, Injectable, ValidationPipe } from '@nestjs/common';
import { UpdateBookingDto } from '@roombook/contract';
import { IncomingMessage } from 'node:http';

type RequestWithBody = IncomingMessage & { body: unknown };

// The global whitelist pipe strips unknown fields before any handler-level pipe sees them.
const strictUpdateBookingPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Injectable()
export class UpdateBookingFieldsGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBody>();
    await strictUpdateBookingPipe.transform(request.body, { type: 'body', metatype: UpdateBookingDto });
    return true;
  }
}
