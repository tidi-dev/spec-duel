import TextField from '@mui/material/TextField';
import type { RoomDto } from '@roombook/contract';

type BookingRoomFilterProps = {
  rooms: RoomDto[];
  roomId?: string;
  onChange: (roomId: string | undefined) => void;
};

export function BookingRoomFilter({ rooms, roomId, onChange }: BookingRoomFilterProps) {
  return (
    <TextField
      select
      id="booking-room-filter"
      label="Room"
      size="small"
      value={roomId ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
      SelectProps={{ native: true }}
      InputLabelProps={{ shrink: true }}
      sx={{ minWidth: 200 }}
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
