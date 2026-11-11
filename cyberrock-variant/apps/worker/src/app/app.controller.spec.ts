import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Test } from '@nestjs/testing';
import { HealthService } from '@roombook/backend-common';
import { HealthPatternEnum } from '@roombook/contract';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [HealthService],
    }).compile();
    controller = moduleRef.get(AppController);
  });

  it('answers the worker health pattern', () => {
    expect(Reflect.getMetadata(PATTERN_METADATA, AppController.prototype.health)).toEqual([HealthPatternEnum.WORKER]);
  });

  it('reports the worker service as ok', () => {
    expect(controller.health()).toEqual({ status: 'ok', service: 'worker' });
  });
});
