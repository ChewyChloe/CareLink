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
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupplyReminderService, CreateReminderInput } from './supply-reminder.service';
import { CommerceLinkResolver } from './commerce-link.resolver';

class CreateSupplyReminderBody {
  child_id: string;
  item_name: string;
  quantity?: string;
  due_at: string;
  guardian_user_id: string;
}

class ConfirmSupplyDraftBody {
  due_at?: string;
  quantity?: string;
  size?: string;
  guardian_user_id?: string;
}

@Controller('supply-reminders')
@UseGuards(AuthGuard)
export class SupplyReminderController {
  constructor(
    private readonly supplyReminderService: SupplyReminderService,
    private readonly commerceLinkResolver: CommerceLinkResolver,
  ) {}

  /**
   * List pending supply drafts for a child.
   * GET /api/supply-reminders/drafts?child_id=...
   */
  @Get('drafts')
  async listDrafts(
    @Query('child_id') childId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!childId) {
      throw new BadRequestException('child_id query parameter is required');
    }
    return this.supplyReminderService.listDrafts(user.id, childId);
  }

  /**
   * Confirm an AI/manual supply draft into an official SupplyTask.
   * POST /api/supply-reminders/drafts/:id/confirm
   */
  @Post('drafts/:id/confirm')
  async confirmDraft(
    @Param('id') draftId: string,
    @Body() body: ConfirmSupplyDraftBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplyReminderService.confirmDraft(user.id, draftId, body);
  }

  /**
   * Cancel an AI supply draft.
   * POST /api/supply-reminders/drafts/:id/cancel
   */
  @Post('drafts/:id/cancel')
  async cancelDraft(
    @Param('id') draftId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplyReminderService.cancelDraft(user.id, draftId);
  }

  /**
   * Get deterministic commerce recommendations for a specific supply task.
   * GET /api/supply-reminders/:id/recommendations
   */
  @Get(':id/recommendations')
  async getRecommendations(
    @Param('id') supplyTaskId: string,
    @Query('preferred_brand') preferredBrand: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplyReminderService.getRecommendationsForTask(
      user.id,
      supplyTaskId,
      preferredBrand,
    );
  }

  /**
   * Create a supply reminder.
   * POST /api/supply-reminders
   */
  @Post()
  async create(
    @Body() body: CreateSupplyReminderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.child_id) {
      throw new BadRequestException('child_id is required');
    }
    if (!body.item_name) {
      throw new BadRequestException('item_name is required');
    }
    if (!body.due_at) {
      throw new BadRequestException('due_at is required');
    }

    const input: CreateReminderInput = {
      item_name: body.item_name,
      quantity: body.quantity,
      due_at: body.due_at,
      guardian_user_id: body.guardian_user_id,
    };

    const task = await this.supplyReminderService.createReminder(user.id, body.child_id, input);

    return {
      ...task,
      commerce_url: this.commerceLinkResolver.resolve(task.item_name),
    };
  }

  /**
   * List supply reminders for a child.
   * GET /api/supply-reminders?child_id=...
   */
  @Get()
  async list(
    @Query('child_id') childId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!childId) {
      throw new BadRequestException('child_id query parameter is required');
    }

    const tasks = await this.supplyReminderService.listByChild(user.id, childId);

    return tasks.map((t) => ({
      ...t,
      commerce_url: this.commerceLinkResolver.resolve(t.item_name),
    }));
  }

  /**
   * Guardian marks as prepared (PENDING → PACKED).
   * POST /api/supply-reminders/:id/pack
   */
  @Post(':id/pack')
  async pack(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplyReminderService.markPacked(user.id, id);
  }

  /**
   * Caregiver confirms receipt (PACKED → RECEIVED).
   * POST /api/supply-reminders/:id/receive
   */
  @Post(':id/receive')
  async receive(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplyReminderService.markReceived(user.id, id);
  }

  /**
   * Cancel a supply reminder.
   * POST /api/supply-reminders/:id/cancel
   */
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplyReminderService.cancel(user.id, id);
  }
}
