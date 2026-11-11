export const parseBookingInstant = (value: string): Date | null => {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
};

export const isEndAfterStart = (startsAt: Date, endsAt: Date): boolean => endsAt.getTime() > startsAt.getTime();
