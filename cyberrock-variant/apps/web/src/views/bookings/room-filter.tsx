import TextField from '@mui/material/TextField';
import type { RoomDto } from '@roombook/contract';

type RoomFilterProps = {
  rooms: RoomDto[];
  roomId: string;
  onChange: (roomId: string) => void;
};

export function RoomFilter({ rooms, roomId, onChange }: RoomFilterProps) {
  return (
    <TextField
      id="bookings-room-filter"
      label="Filter by room"
      select
      SelectProps={{ native: true }}
      InputLabelProps={{ shrink: true }}
      size="small"
      value={roomId}
      onChange={(event) => onChange(event.target.value)}
      sx={{ mb: 2, minWidth: 220 }}
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
