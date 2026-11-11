import { SimulatedConfirmationSender } from './simulated-confirmation-sender';

describe('SimulatedConfirmationSender', () => {
  const sender = new SimulatedConfirmationSender();

  it.each([
    ['ada@retry.example', 1, false],
    ['ada@retry.example', 2, false],
    ['ada@retry.example', 3, true],
    ['ada@bounce.example', 1, false],
    ['ada@bounce.example', 2, false],
    ['ada@bounce.example', 3, false],
    ['ada@example.com', 1, true],
    ['ada@not-retry.example', 1, true],
    ['Ada@RETRY.Example', 1, false],
    ['Ada@RETRY.Example', 3, true],
    ['Ada@Bounce.EXAMPLE', 3, false],
  ])('send(%s, attempt %i) answers %s', (organizerEmail, attempt, sent) => {
    expect(sender.send(organizerEmail, attempt)).toBe(sent);
  });
});
