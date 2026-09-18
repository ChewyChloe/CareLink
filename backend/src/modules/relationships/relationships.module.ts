import { Module } from '@nestjs/common';
import { ChildrenController } from './children.controller';
import { ChildrenService } from './children.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { AccessGrantGuard } from './guards/access-grant.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ChildrenController, InvitationsController],
  providers: [ChildrenService, InvitationsService, AccessGrantGuard],
  exports: [ChildrenService, InvitationsService, AccessGrantGuard],
})
export class RelationshipsModule {}
