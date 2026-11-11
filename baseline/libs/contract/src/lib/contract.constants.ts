export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed';

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const BOOKING_TITLE_MAX_LENGTH = 120;

export const CONFIRMATION_JOB_ATTEMPTS = 3;
export const CONFIRMATION_BACKOFF_MS = 1000;

export const RETRY_EMAIL_DOMAIN = 'retry.example';
export const BOUNCE_EMAIL_DOMAIN = 'bounce.example';

export const confirmationJobId = (bookingId: string): string => `confirmation-${bookingId}`;
