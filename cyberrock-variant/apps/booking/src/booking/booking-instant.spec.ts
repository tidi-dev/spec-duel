import { execFileSync } from 'child_process';
import { join } from 'path';
import { parseInstant } from './booking-instant';

class ZoneRunDto {
  offsetMinutes: number;
  results: Array<string | null>;
}

const TZ_INPUTS = [
  '2030-01-07T09:00',
  '2030-01-07T09:00:00',
  '2030-01-07T16:00:00+07:00',
  '2030-01-07T09:00:00Z',
  '2030-01-07T09:00:00.5Z',
];

// Jest hands specs a copy of process.env, so TZ only takes effect in a fresh process.
const parseUnderTimeZone = (timeZone: string): ZoneRunDto => {
  const script = `
    require(${JSON.stringify(require.resolve('ts-node'))}).register({
      transpileOnly: true,
      compilerOptions: { module: 'commonjs' },
    });
    const { parseInstant } = require(${JSON.stringify(join(__dirname, 'booking-instant.ts'))});
    const results = ${JSON.stringify(TZ_INPUTS)}.map((input) => {
      const parsed = parseInstant(input);
      return parsed ? parsed.toISOString() : null;
    });
    console.log(JSON.stringify({ offsetMinutes: new Date(2030, 0, 7, 9).getTimezoneOffset(), results }));
  `;
  const output = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, TZ: timeZone },
    encoding: 'utf8',
  });
  return JSON.parse(output) as ZoneRunDto;
};

describe('parseInstant (BKG-003)', () => {
  it.each([
    ['2030-01-07T09:00:00Z', '2030-01-07T09:00:00.000Z'],
    ['2030-01-07T09:00:00.000Z', '2030-01-07T09:00:00.000Z'],
    ['2030-01-07T09:00:00.1Z', '2030-01-07T09:00:00.100Z'],
    ['2030-01-07T09:00:00.12Z', '2030-01-07T09:00:00.120Z'],
    ['2030-01-07T09:00:00.123Z', '2030-01-07T09:00:00.123Z'],
    ['2030-01-07T16:00:00+07:00', '2030-01-07T09:00:00.000Z'],
    ['2030-01-07T10:00:00+01:00', '2030-01-07T09:00:00.000Z'],
    ['2030-01-07T03:30:00-05:30', '2030-01-07T09:00:00.000Z'],
    ['2030-01-07T09:00:00+00:00', '2030-01-07T09:00:00.000Z'],
    ['2028-02-29T23:59:59.999Z', '2028-02-29T23:59:59.999Z'],
  ])('reads %s as the instant %s', (input, expected) => {
    expect(parseInstant(input)?.toISOString()).toBe(expected);
  });

  it.each([
    ['no offset, minutes only', '2030-01-07T09:00'],
    ['no offset', '2030-01-07T09:00:00'],
    ['date only', '2030-01-07'],
    ['week date', '2030-W02-1T09:00:00Z'],
    ['ordinal date', '2030-007T09:00:00Z'],
    ['more than three fraction digits', '2030-01-07T09:00:00.123456Z'],
    ['lower case designators', '2030-01-07t09:00:00z'],
    ['a day that does not exist', '2030-02-30T09:00:00Z'],
    ['29 February of a common year', '2030-02-29T09:00:00Z'],
    ['month 13', '2030-13-01T09:00:00Z'],
    ['hour 24', '2030-01-07T24:00:00Z'],
    ['minute 60', '2030-01-07T09:60:00Z'],
    ['second 60', '2030-01-07T09:00:60Z'],
    ['an empty fraction', '2030-01-07T09:00:00.Z'],
    ['an offset without a colon', '2030-01-07T16:00:00+0700'],
    ['an offset of hours only', '2030-01-07T16:00:00+07'],
    ['an offset hour past 23', '2030-01-07T16:00:00+24:00'],
    ['an offset minute past 59', '2030-01-07T16:00:00+07:60'],
    ['a space instead of T', '2030-01-07 09:00:00Z'],
    ['surrounding white space', ' 2030-01-07T09:00:00Z '],
    ['a trailing line break', '2030-01-07T09:00:00Z\n'],
    ['an empty string', ''],
  ])('rejects %s', (_case, input) => {
    expect(parseInstant(input)).toBeNull();
  });

  it.each([[null], [undefined], [1893488400000], [new Date('2030-01-07T09:00:00Z')], [{}]])(
    'rejects the non-string value %p',
    (input) => {
      expect(parseInstant(input)).toBeNull();
    },
  );

  it('gives the same answers under TZ=UTC and TZ=Asia/Ho_Chi_Minh (R-04)', () => {
    const utc = parseUnderTimeZone('UTC');
    const hoChiMinh = parseUnderTimeZone('Asia/Ho_Chi_Minh');

    expect(utc.offsetMinutes).toBe(0);
    expect(hoChiMinh.offsetMinutes).toBe(-420);
    expect(utc.results).toEqual([
      null,
      null,
      '2030-01-07T09:00:00.000Z',
      '2030-01-07T09:00:00.000Z',
      '2030-01-07T09:00:00.500Z',
    ]);
    expect(hoChiMinh.results).toEqual(utc.results);
  });
});
