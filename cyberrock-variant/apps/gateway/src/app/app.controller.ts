import { Controller, Get } from '@nestjs/common';
import { HealthService, HealthStatusDto } from '@roombook/backend-common';
import { ApiRouteEnum, ServiceNameEnum } from '@roombook/contract';

@Controller(ApiRouteEnum.HEALTH)
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @Get(ServiceNameEnum.GATEWAY)
  health(): HealthStatusDto {
    return this.healthService.check(ServiceNameEnum.GATEWAY);
  }
}
