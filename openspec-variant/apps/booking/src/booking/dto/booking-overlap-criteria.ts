export class BookingOverlapCriteria {
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  excludedBookingId?: string;
}
