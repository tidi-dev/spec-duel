import { SimulatedConfirmationSender } from './simulated-confirmation.sender';

describe('SimulatedConfirmationSender.deliver', () => {
  const sender = new SimulatedConfirmationSender();

  it.each([
    ['ana@example.com', 1, true],
    ['ana@example.com', 2, true],
    ['ana@example.com', 3, true],
    ['ana@retry.example', 1, false],
    ['ana@retry.example', 2, false],
    ['ana@retry.example', 3, true],
    ['ana@bounce.example', 1, false],
    ['ana@bounce.example', 2, false],
    ['ana@bounce.example', 3, false],
    ['ana@BOUNCE.EXAMPLE', 1, false],
    ['ana@BOUNCE.EXAMPLE', 3, false],
    ['ana@Retry.Example', 2, false],
    ['ana@Retry.Example', 3, true],
    ['retry.example@example.com', 1, true],
    ['ana@notbounce.example', 1, true],
  ])('%s on attempt %i is delivered: %s', (organizerEmail, attempt, delivered) => {
    expect(sender.deliver(organizerEmail, attempt)).toBe(delivered);
  });
});
