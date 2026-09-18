import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService, HealthCheckResult } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getHealth(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }

  @Get('api/health')
  @HttpCode(HttpStatus.OK)
  async getApiHealth(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }
}
