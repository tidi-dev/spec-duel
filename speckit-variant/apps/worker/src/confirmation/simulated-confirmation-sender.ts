import { Injectable } from '@nestjs/common';
import { BOUNCE_EMAIL_DOMAIN, CONFIRMATION_JOB_ATTEMPTS, RETRY_EMAIL_DOMAIN } from '@roombook/contract';

@Injectable()
export class SimulatedConfirmationSender {
  send(organizerEmail: string, attempt: number): boolean {
    const address = organizerEmail.toLowerCase();
    if (address.endsWith(`@${BOUNCE_EMAIL_DOMAIN}`)) {
      return false;
    }
    return !address.endsWith(`@${RETRY_EMAIL_DOMAIN}`) || attempt >= CONFIRMATION_JOB_ATTEMPTS;
  }
}
