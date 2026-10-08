import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupplyReminderService } from './supply-reminder.service';
import { SupplyReminderController } from './supply-reminder.controller';
import { CommerceLinkResolver } from './commerce-link.resolver';
import { StaticCommerceProvider } from './commerce/static-commerce.provider';

@Module({
  imports: [AuthModule],
  controllers: [SupplyReminderController],
  providers: [SupplyReminderService, CommerceLinkResolver, StaticCommerceProvider],
  exports: [SupplyReminderService, CommerceLinkResolver, StaticCommerceProvider],
})
export class HandoffModule {}
