import { Injectable } from '@nestjs/common';
import { ServiceNameEnum } from '@roombook/contract';

export class HealthStatusDto {
  status: 'ok';
  service: string;
}

@Injectable()
export class HealthService {
  check(service: ServiceNameEnum): HealthStatusDto {
    return { status: 'ok', service };
  }
}
