import { Injectable } from '@nestjs/common';
import { BOUNCE_EMAIL_DOMAIN, CONFIRMATION_JOB_ATTEMPTS, RETRY_EMAIL_DOMAIN } from '@roombook/contract';

@Injectable()
export class SimulatedConfirmationSender {
  deliver(organizerEmail: string, attempt: number): boolean {
    const address = organizerEmail.toLowerCase();
    if (address.endsWith(`@${BOUNCE_EMAIL_DOMAIN}`)) {
      return false;
    }
    if (address.endsWith(`@${RETRY_EMAIL_DOMAIN}`)) {
      return attempt >= CONFIRMATION_JOB_ATTEMPTS;
    }
    return true;
  }
}
