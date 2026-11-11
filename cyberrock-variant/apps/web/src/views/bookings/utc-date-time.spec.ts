import { formatUtc, isoToUtcInput, parseUtcInput, utcInputToIso } from './utc-date-time';

describe('utc-date-time', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  describe.each(['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'])('under TZ=%s', (tz) => {
    beforeEach(() => {
      process.env.TZ = tz;
    });

    it('formats an instant as YYYY-MM-DD HH:mm UTC', () => {
      expect(formatUtc('2030-01-07T09:00:00.000Z')).toBe('2030-01-07 09:00 UTC');
      expect(formatUtc('2030-01-07T23:59:30.123Z')).toBe('2030-01-07 23:59 UTC');
    });

    it('formats an instant given with an offset in UTC', () => {
      expect(formatUtc('2030-01-07T16:00:00+07:00')).toBe('2030-01-07 09:00 UTC');
    });

    it('reads a datetime-local value as UTC', () => {
      expect(utcInputToIso('2030-01-07T09:00')).toBe('2030-01-07T09:00:00.000Z');
      expect(utcInputToIso('2030-01-07T10:00')).toBe('2030-01-07T10:00:00.000Z');
    });

    it('turns an instant into the datetime-local value of its UTC minute', () => {
      expect(isoToUtcInput('2030-01-07T09:00:30.123Z')).toBe('2030-01-07T09:00');
      expect(isoToUtcInput('2030-01-07T16:00:00+07:00')).toBe('2030-01-07T09:00');
    });

    it('gives the epoch milliseconds of a datetime-local value read as UTC', () => {
      expect(parseUtcInput('2030-01-07T09:00')).toBe(Date.UTC(2030, 0, 7, 9, 0));
    });
  });

  it('gives NaN for a value that is not a date-time', () => {
    expect(parseUtcInput('')).toBeNaN();
    expect(parseUtcInput('nonsense')).toBeNaN();
  });
});
