import { useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { RoomDto } from '@roombook/contract';
import { listRooms } from '../../services/room.service';
import { errorMessage } from './error-message';

const loadEveryRoom = async (): Promise<RoomDto[]> => {
  const rooms: RoomDto[] = [];
  for (let page = 1; ; page += 1) {
    const { items, total } = await listRooms(page, DEFAULT_PAGE_SIZE);
    rooms.push(...items);
    if (items.length === 0 || rooms.length >= total) return rooms;
  }
};

export function useAllRooms() {
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadEveryRoom()
      .then((loaded) => active && setRooms(loaded))
      .catch((e: unknown) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  return { rooms, error };
}
