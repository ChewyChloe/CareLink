import { Module, forwardRef } from '@nestjs/common';
import { ExtractionWorker } from './extraction.worker';
import { SupplyReminderWorker } from './supply-reminder.worker';
import { AiModule } from '../ai/ai.module';
import { LineModule } from '../line/line.module';
import { HandoffModule } from '../handoff/handoff.module';

@Module({
  imports: [AiModule, forwardRef(() => LineModule), forwardRef(() => HandoffModule)],
  providers: [ExtractionWorker, SupplyReminderWorker],
  exports: [ExtractionWorker, SupplyReminderWorker],
})
export class JobsModule {}
