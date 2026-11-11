import { confirmationJobId } from './contract.constants';
import { ErrorCodeEnum } from './error-code.enum';

describe('confirmationJobId', () => {
  it('builds one stable job id per booking', () => {
    expect(confirmationJobId('abc')).toBe('confirmation-abc');
  });
});

describe('ErrorCodeEnum', () => {
  it('BKG-013 names the booking overlap conflict', () => {
    expect(ErrorCodeEnum.BOOKING_OVERLAP).toBe('CONFLICT.BOOKING_OVERLAP');
  });
});
