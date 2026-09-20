import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { SettlementSummaryDto } from './billing.dto';

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Public preview showcase endpoint for the Golden Path demo:
   * 18:00 end, 18:31 checkout -> 31 min overtime, ceil(31/30) = 2 units, 2 * 98 = NT$196.
   * GET /api/billing/demo-showcase?period=2026-09
   */
  @Get(['billing/demo-showcase', 'api/billing/demo-showcase'])
  @HttpCode(HttpStatus.OK)
  getDemoShowcase(@Query('period') period?: string): SettlementSummaryDto {
    return this.billingService.getDemoShowcase(period || '2026-09');
  }

  /**
   * Retrieves monthly settlements for a specific child.
   * GET /api/children/:childId/settlements?period=2026-09
   * GET /api/children/:childId/billing/summary?period=2026-09
   */
  @Get([
    'children/:childId/settlements',
    'api/children/:childId/settlements',
    'children/:childId/billing/summary',
    'api/children/:childId/billing/summary',
  ])
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getSettlementsForChild(
    @Param('childId') childId: string,
    @Query('period') period: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SettlementSummaryDto[]> {
    return this.billingService.getSettlementsForChild(childId, user.id, period || '2026-09');
  }
}
