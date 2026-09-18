import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InvitationsService, CreateInvitationDto } from './invitations.service';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CsrfOriginGuard } from '../../common/guards/csrf-origin.guard';

@Controller()
@UseGuards(AuthGuard, CsrfOriginGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post(['invitations', 'api/invitations'])
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvitation(user.id, dto);
  }

  @Post(['invitations/:token/accept', 'api/invitations/:token/accept'])
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ) {
    return this.invitationsService.acceptInvitation(user.id, token);
  }

  @Post(['invitations/:id/activate', 'api/invitations/:id/activate'])
  @HttpCode(HttpStatus.OK)
  async activateInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') invitationId: string,
  ) {
    return this.invitationsService.activateInvitation(user.id, invitationId);
  }
}
