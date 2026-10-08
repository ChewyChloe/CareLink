import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupplyReminderService } from './supply-reminder.service';
import { SupplyReminderController } from './supply-reminder.controller';
import { CommerceLinkResolver } from './commerce-link.resolver';

@Module({
  imports: [AuthModule],
  controllers: [SupplyReminderController],
  providers: [SupplyReminderService, CommerceLinkResolver],
  exports: [SupplyReminderService, CommerceLinkResolver],
})
export class HandoffModule {}
