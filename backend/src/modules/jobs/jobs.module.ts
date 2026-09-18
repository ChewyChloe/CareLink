import { Module, forwardRef } from '@nestjs/common';
import { ExtractionWorker } from './extraction.worker';
import { AiModule } from '../ai/ai.module';
import { LineModule } from '../line/line.module';

@Module({
  imports: [AiModule, forwardRef(() => LineModule)],
  providers: [ExtractionWorker],
  exports: [ExtractionWorker],
})
export class JobsModule {}
