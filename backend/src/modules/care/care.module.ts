import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DraftService } from './draft.service';
import { DraftController } from './draft.controller';
import { TimelineService } from './timeline.service';
import { TimelineController } from './timeline.controller';

@Module({
  imports: [AuthModule],
  controllers: [DraftController, TimelineController],
  providers: [DraftService, TimelineService],
  exports: [DraftService, TimelineService],
})
export class CareModule {}
