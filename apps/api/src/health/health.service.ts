import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  service: 'scpc-api';
  status: 'ok';
}

@Injectable()
export class HealthService {
  getStatus(): HealthStatus {
    return {
      service: 'scpc-api',
      status: 'ok',
    };
  }
}
