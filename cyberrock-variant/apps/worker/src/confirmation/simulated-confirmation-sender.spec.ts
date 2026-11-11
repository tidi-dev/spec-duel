import 'reflect-metadata';
import { simulateConfirmationSend } from './simulated-confirmation-sender';

const outcomes = (organizerEmail: string): boolean[] =>
  [1, 2, 3].map((attempt) => simulateConfirmationSend(organizerEmail, attempt));

describe('simulateConfirmationSend (CNF-004)', () => {
  it.each(['ann@retry.example', 'ann@RETRY.EXAMPLE', 'ann@Retry.Example'])(
    'fails attempts 1 and 2 and succeeds on attempt 3 for %s',
    (organizerEmail) => {
      expect(outcomes(organizerEmail)).toEqual([false, false, true]);
    },
  );

  it.each(['ann@bounce.example', 'ann@BOUNCE.example'])('fails attempts 1, 2 and 3 for %s', (organizerEmail) => {
    expect(outcomes(organizerEmail)).toEqual([false, false, false]);
  });

  it.each([
    'ann@example.com',
    'ann@notretry.example',
    'retry.example@example.com',
    'bounce.example@example.com',
    'ann@retry.example.com',
    'ann@sub.bounce.example',
    '"ann@bounce.example"@example.com',
  ])('succeeds on the first attempt for %s', (organizerEmail) => {
    expect(simulateConfirmationSend(organizerEmail, 1)).toBe(true);
  });
});
