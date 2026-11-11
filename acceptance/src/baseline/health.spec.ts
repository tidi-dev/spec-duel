import { get } from '../support/http';

describe('health', () => {
  it.each(['gateway', 'booking', 'room', 'worker'])('GET /health/%s answers 200', async (service) => {
    const result = await get(`/health/${service}`);

    expect(result.status).toBe(200);
  });
});
