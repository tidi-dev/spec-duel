export enum HealthPatternEnum {
  BOOKING = 'health:booking',
  ROOM = 'health:room',
  WORKER = 'health:worker',
}

export enum RoomPatternEnum {
  LIST = 'room:listRooms',
  FIND_BY_ID = 'room:findRoomById',
}

export enum BookingPatternEnum {
  CREATE = 'booking:createBooking',
  LIST = 'booking:listBookings',
  FIND_BY_ID = 'booking:findBookingById',
  UPDATE = 'booking:updateBooking',
  DELETE = 'booking:deleteBooking',
  RECORD_CONFIRMATION = 'booking:recordConfirmationResult',
}
