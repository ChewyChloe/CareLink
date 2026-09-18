import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';

function getPrismaClientOptions(): { options?: { adapter: PrismaNeon }; pool?: Pool } {
  const url = process.env.DATABASE_URL || '';
  if (url.includes('neon.tech')) {
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url });
    pool.on('error', (err) => {
      // Catch idle connection drops so they don't terminate Node process
      console.warn('[PrismaNeon Pool] WebSocket pool connection error (handled):', err.message);
    });
    const adapter = new PrismaNeon(pool);
    return { options: { adapter }, pool };
  }
  return {};
}

const initialNeonConfig = getPrismaClientOptions();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger;
  private pool?: Pool;

  constructor() {
    const cfg = getPrismaClientOptions();
    super(cfg.options);
    this.logger = new Logger(PrismaService.name);
    this.pool = cfg.pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully.');
    } catch (error) {
      this.logger.warn(`Initial database connection attempt failed: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
    this.logger.log('Database disconnected.');
  }

  async checkHealth(): Promise<{ isHealthy: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        isHealthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        isHealthy: false,
        error: (err as Error).message,
      };
    }
  }
}
