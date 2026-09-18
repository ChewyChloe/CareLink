import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DraftService } from './draft.service';
import { FlexMessageBuilder } from '../line/flex/flex-message.builder';

export class ConfirmDraftRequestBody {
  expected_version?: number;
  idempotency_key?: string;
  items?: Array<{
    item_index?: number;
    event_type: string;
    temporal_status?: string;
    occurred_at: string;
    payload: Record<string, any>;
    missing_fields?: string[];
  }>;
}

@Controller('drafts')
@UseGuards(AuthGuard)
export class DraftController {
  constructor(
    private readonly draftService: DraftService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * List pending drafts for a specific child.
   * GET /api/drafts/pending?child_id=...
   */
  @Get('pending')
  async getPendingDrafts(
    @Query('child_id') childId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!childId) {
      throw new BadRequestException('child_id query parameter is required');
    }
    return this.draftService.getPendingDrafts(childId, user.id);
  }

  /**
   * Get draft by ID with child alias and full item details.
   * GET /api/drafts/:id
   */
  @Get(':id')
  async getDraft(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftService.getDraft(id, user.id);
  }

  /**
   * Get LINE Flex Message preview payload for a draft batch.
   * GET /api/drafts/:id/flex-preview
   */
  @Get(':id/flex-preview')
  async getFlexPreview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const draft = await this.draftService.getDraft(id, user.id);
    const miniAppChannelId =
      this.configService.get<string>('LINE_MINI_APP_CHANNEL_ID') || 'dummy-channel-id';

    const flexPayload = FlexMessageBuilder.buildDraftConfirmationFlex(
      {
        id: draft.id,
        child_alias: draft.child?.display_alias,
        status: draft.status,
        lock_version: draft.lock_version,
        items: (draft.items as any[]) || [],
        created_at: draft.created_at,
        expires_at: draft.expires_at,
      },
      miniAppChannelId,
    );

    return {
      draftId: draft.id,
      flexMessage: flexPayload,
    };
  }

  /**
   * Confirm a draft batch and convert into official CareEvents.
   * POST /api/drafts/:id/confirm
   */
  @Post(':id/confirm')
  async confirmDraft(
    @Param('id') id: string,
    @Body() body: ConfirmDraftRequestBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftService.confirmDraft({
      draftId: id,
      userId: user.id,
      expectedVersion: body.expected_version,
      idempotencyKey: body.idempotency_key,
      correctedItems: body.items,
    });
  }

  /**
   * Cancel/discard a draft batch.
   * POST /api/drafts/:id/cancel
   */
  @Post(':id/cancel')
  async cancelDraft(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftService.cancelDraft(id, user.id);
  }
}
