import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  database: {
    status: 'connected' | 'disconnected';
    reason?: string;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const dbHealth = await this.prisma.checkHealth();

    if (dbHealth.isHealthy) {
      return {
        status: 'ok',
        service: 'CareLink Modular Monolith Backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        database: {
          status: 'connected',
        },
      };
    }

    // Log the internal error sanitized (no passwords/secrets)
    this.logger.warn('Database health check probe failed. Service operating in degraded mode.');

    return {
      status: 'degraded',
      service: 'CareLink Modular Monolith Backend',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        reason: 'Database connection unavailable',
      },
    };
  }
}
