import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Slot = {
  startsAt: string;
  endsAt: string;
};

const COUNTER_FILE = join(__dirname, '..', '..', '.slot-counter');
const FIRST_SLOT_MS = Date.UTC(2040, 0, 1, 0, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const SLOT_SPACING_MS = 2 * HOUR_MS;

const nextIndex = (): number => {
  const current = existsSync(COUNTER_FILE) ? Number(readFileSync(COUNTER_FILE, 'utf8')) : 0;
  const next = Number.isInteger(current) ? current + 1 : 1;
  writeFileSync(COUNTER_FILE, String(next));
  return next;
};

export const nextSlot = (): Slot => {
  const start = FIRST_SLOT_MS + nextIndex() * SLOT_SPACING_MS;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + HOUR_MS).toISOString(),
  };
};

export const shift = (slot: Slot, minutes: number): Slot => ({
  startsAt: new Date(Date.parse(slot.startsAt) + minutes * 60 * 1000).toISOString(),
  endsAt: new Date(Date.parse(slot.endsAt) + minutes * 60 * 1000).toISOString(),
});
