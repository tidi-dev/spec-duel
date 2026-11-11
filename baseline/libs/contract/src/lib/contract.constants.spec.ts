import { confirmationJobId } from './contract.constants';

describe('confirmationJobId', () => {
  it('builds one stable job id per booking', () => {
    expect(confirmationJobId('abc')).toBe('confirmation-abc');
  });
});
