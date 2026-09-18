import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { RelationshipsModule } from './modules/relationships/relationships.module';
import { LineModule } from './modules/line/line.module';
import { CareModule } from './modules/care/care.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { BillingModule } from './modules/billing/billing.module';
import { HandoffModule } from './modules/handoff/handoff.module';
import { AiModule } from './modules/ai/ai.module';
import { AuditModule } from './modules/audit/audit.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    RelationshipsModule,
    LineModule,
    CareModule,
    ContractsModule,
    BillingModule,
    HandoffModule,
    AiModule,
    AuditModule,
    JobsModule,
  ],
})
export class AppModule {}
