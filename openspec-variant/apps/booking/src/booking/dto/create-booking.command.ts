export class CreateBookingCommand {
  idempotencyKey: string;
  requestFingerprint: string;
  roomId: string;
  title: string;
  organizerEmail: string;
  startsAt: Date;
  endsAt: Date;
}
