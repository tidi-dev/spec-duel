import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthService, HealthStatusDto } from '@roombook/backend-common';
import { HealthPatternEnum, ServiceNameEnum } from '@roombook/contract';

@Controller()
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @MessagePattern(HealthPatternEnum.WORKER)
  health(): HealthStatusDto {
    return this.healthService.check(ServiceNameEnum.WORKER);
  }
}
