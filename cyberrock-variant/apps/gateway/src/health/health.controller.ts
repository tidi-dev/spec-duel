import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { HealthStatusDto, NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import { ApiRouteEnum, HealthPatternEnum, ServiceNameEnum } from '@roombook/contract';

@Controller(ApiRouteEnum.HEALTH)
export class HealthController {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  @Get(ServiceNameEnum.BOOKING)
  booking(): Promise<HealthStatusDto> {
    return this.check(HealthPatternEnum.BOOKING);
  }

  @Get(ServiceNameEnum.ROOM)
  room(): Promise<HealthStatusDto> {
    return this.check(HealthPatternEnum.ROOM);
  }

  @Get(ServiceNameEnum.WORKER)
  worker(): Promise<HealthStatusDto> {
    return this.check(HealthPatternEnum.WORKER);
  }

  private check(pattern: HealthPatternEnum): Promise<HealthStatusDto> {
    return NatsRequestUtil.send<HealthStatusDto, Record<string, never>>(this.client, pattern, {});
  }
}
