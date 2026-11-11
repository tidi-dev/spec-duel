import { Paged, Room } from '../support/bookings';
import { get } from '../support/http';

const names = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => `Room ${String(from + index).padStart(2, '0')}`);

describe('GET /rooms', () => {
  it('returns the first 10 of 12 rooms by default, ordered by name', async () => {
    const result = await get<Paged<Room>>('/rooms');

    expect(result.status).toBe(200);
    expect(result.body.total).toBe(12);
    expect(result.body.page).toBe(1);
    expect(result.body.limit).toBe(10);
    expect(result.body.items.map((room) => room.name)).toEqual(names(1, 10));
  });

  it('returns the last two rooms on page 2 at the default page size', async () => {
    const result = await get<Paged<Room>>('/rooms?page=2');

    expect(result.status).toBe(200);
    expect(result.body.items.map((room) => room.name)).toEqual(names(11, 12));
  });

  it('returns each room with an id, a name and a capacity', async () => {
    const result = await get<Paged<Room>>('/rooms');

    for (const room of result.body.items) {
      expect(room.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof room.name).toBe('string');
      expect(typeof room.capacity).toBe('number');
    }
  });

  it('rejects page 0 with 400', async () => {
    const result = await get('/rooms?page=0');

    expect(result.status).toBe(400);
  });
});
