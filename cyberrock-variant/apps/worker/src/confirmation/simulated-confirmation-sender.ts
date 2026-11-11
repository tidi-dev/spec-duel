import { BOUNCE_EMAIL_DOMAIN, CONFIRMATION_JOB_ATTEMPTS, RETRY_EMAIL_DOMAIN } from '@roombook/contract';

export const simulateConfirmationSend = (organizerEmail: string, attempt: number): boolean => {
  const domain = organizerEmail.slice(organizerEmail.lastIndexOf('@') + 1).toLowerCase();
  if (domain === BOUNCE_EMAIL_DOMAIN) {
    return false;
  }
  return domain !== RETRY_EMAIL_DOMAIN || attempt >= CONFIRMATION_JOB_ATTEMPTS;
};
