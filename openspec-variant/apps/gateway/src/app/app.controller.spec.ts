import { Test } from '@nestjs/testing';
import { HealthService } from '@roombook/backend-common';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('reports the gateway as ok', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [HealthService],
    }).compile();

    expect(moduleRef.get(AppController).health()).toEqual({ status: 'ok', service: 'gateway' });
  });
});
