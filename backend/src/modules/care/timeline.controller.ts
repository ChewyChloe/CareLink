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
import { CsrfOriginGuard } from '../../common/guards/csrf-origin.guard';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TimelineService } from './timeline.service';
import {
  TimelineQueryDto,
  CreateEventCorrectionDto,
  TimelineResponseDto,
  EventRevisionHistoryDto,
  TimelineItemDto,
  DailySummaryMetricsDto,
  GrowthReportsDto,
} from './timeline.dto';
import { CreateManualEventDto, RecordDailyLogViewDto } from './manual-entry.dto';
import {
  CreateGuardianInstructionDto,
  GuardianInstructionResponseDto,
} from './guardian-instruction.dto';

@Controller()
@UseGuards(AuthGuard, CsrfOriginGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  /**
   * Retrieves confirmed Timeline for a child.
   * GET /api/children/:childId/timeline
   */
  @Get('children/:childId/timeline')
  async getTimeline(
    @Param('childId') childId: string,
    @Query() query: TimelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TimelineResponseDto> {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.getTimeline(childId, user.id, query);
  }

  /**
   * Manually creates a care event (bypasses DraftBatch).
   * POST /api/children/:childId/events
   */
  @Post('children/:childId/events')
  async createManualEvent(
    @Param('childId') childId: string,
    @Body() body: CreateManualEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TimelineItemDto> {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.createManualEvent(childId, user.id, body);
  }

  /**
   * Records guardian read receipt for a specific date's Daily Log.
   * POST /api/children/:childId/daily-log-views
   */
  @Post('children/:childId/daily-log-views')
  async recordDailyLogView(
    @Param('childId') childId: string,
    @Body() body: RecordDailyLogViewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.recordDailyLogView(childId, user.id, body);
  }

  /**
   * Creates a guardian instruction (Guardian-only).
   * POST /api/children/:childId/instructions
   */
  @Post('children/:childId/instructions')
  async createInstruction(
    @Param('childId') childId: string,
    @Body() body: CreateGuardianInstructionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuardianInstructionResponseDto> {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.createGuardianInstruction(childId, user.id, body);
  }

  /**
   * Revokes a guardian instruction (Guardian-only).
   * POST /api/children/:childId/instructions/:instructionId/revoke
   */
  @Post('children/:childId/instructions/:instructionId/revoke')
  async revokeInstruction(
    @Param('childId') childId: string,
    @Param('instructionId') instructionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuardianInstructionResponseDto> {
    if (!childId || !instructionId) {
      throw new BadRequestException('childId and instructionId are required');
    }
    return this.timelineService.revokeGuardianInstruction(childId, instructionId, user.id);
  }

  /**
   * Gets guardian instructions for a child.
   * GET /api/children/:childId/instructions
   */
  @Get('children/:childId/instructions')
  async getInstructions(
    @Param('childId') childId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuardianInstructionResponseDto[]> {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.getGuardianInstructions(childId, user.id);
  }

  /**
   * Retrieves deterministic daily summary metrics.
   * GET /api/children/:childId/summary?date=YYYY-MM-DD
   */
  @Get('children/:childId/summary')
  async getDailySummary(
    @Param('childId') childId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DailySummaryMetricsDto> {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.getDailySummaryMetrics(childId, user.id, date);
  }

  /**
   * Retrieves deterministic growth reports and monthly analytics.
   * GET /api/children/:childId/reports?month=YYYY-MM
   */
  @Get('children/:childId/reports')
  async getGrowthReports(
    @Param('childId') childId: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GrowthReportsDto> {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.getReportsData(childId, user.id, month);
  }

  /**
   * Retrieves month calendar summary for a child.
   * GET /api/children/:childId/calendar?month=YYYY-MM
   */
  @Get('children/:childId/calendar')
  async getCalendar(
    @Param('childId') childId: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    return this.timelineService.getMonthSummary(childId, user.id, month);
  }

  /**
   * Retrieves revision audit history for a CareEvent.
   * GET /api/care-events/:eventId/history
   */
  @Get('care-events/:eventId/history')
  async getEventHistory(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EventRevisionHistoryDto> {
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    return this.timelineService.getEventHistory(eventId, user.id);
  }

  /**
   * Creates a revision correction or VOID for a CareEvent.
   * POST /api/care-events/:eventId/corrections
   */
  @Post('care-events/:eventId/corrections')
  async createCorrection(
    @Param('eventId') eventId: string,
    @Body() body: CreateEventCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TimelineItemDto> {
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    return this.timelineService.createCorrection(eventId, user.id, body);
  }
}
