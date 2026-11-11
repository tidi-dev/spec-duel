import TextField from '@mui/material/TextField';
import type { RoomDto } from '@roombook/contract';

type BookingRoomFilterProps = {
  rooms: RoomDto[];
  roomId: string;
  onChange: (roomId: string) => void;
};

export function BookingRoomFilter({ rooms, roomId, onChange }: BookingRoomFilterProps) {
  return (
    <TextField
      id="booking-room-filter"
      select
      label="Filter by room"
      size="small"
      value={roomId}
      onChange={(event) => onChange(event.target.value)}
      SelectProps={{ native: true }}
      InputLabelProps={{ shrink: true }}
      sx={{ minWidth: 220 }}
    >
      <option value="">All rooms</option>
      {rooms.map((room) => (
        <option key={room.id} value={room.id}>
          {room.name}
        </option>
      ))}
    </TextField>
  );
}
