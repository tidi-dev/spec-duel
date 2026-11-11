const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/;

const MS_PER_MINUTE = 60_000;

export const INSTANT_GRAMMAR = 'YYYY-MM-DDTHH:mm:ss[.f{1,3}](Z|±HH:MM)';

export const parseInstant = (value: unknown): Date | null => {
  const match = typeof value === 'string' ? INSTANT_PATTERN.exec(value) : null;
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const exists =
    wallClock.getUTCFullYear() === year &&
    wallClock.getUTCMonth() === month - 1 &&
    wallClock.getUTCDate() === day &&
    wallClock.getUTCHours() === hour &&
    wallClock.getUTCMinutes() === minute &&
    wallClock.getUTCSeconds() === second;
  if (!exists) {
    return null;
  }
  const offsetMinutes = match[8] ? Number(`${match[8]}1`) * (Number(match[9]) * 60 + Number(match[10])) : 0;
  return new Date(wallClock.getTime() - offsetMinutes * MS_PER_MINUTE);
};
