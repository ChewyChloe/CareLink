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

@Controller('supply-reminders')
@UseGuards(AuthGuard)
export class SupplyReminderController {
  constructor(
    private readonly supplyReminderService: SupplyReminderService,
    private readonly commerceLinkResolver: CommerceLinkResolver,
  ) {}

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
