import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { SettlementSummaryDto } from './billing.dto';

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Public / preview showcase endpoint for the mandatory demo case:
   * 18:00 end, 18:31 checkout -> 31 min overtime, ceil(31/30) = 2 units, 2 * 98 = NT$196.
   * GET /api/billing/demo-showcase?period=2026-09
   */
  @Get('billing/demo-showcase')
  getDemoShowcase(@Query('period') period?: string): SettlementSummaryDto {
    return this.billingService.getDemoShowcase(period || '2026-09');
  }

  /**
   * Retrieves monthly settlements for a specific child.
   * GET /api/children/:childId/settlements?period=2026-09
   */
  @Get('children/:childId/settlements')
  @UseGuards(AuthGuard)
  async getSettlementsForChild(
    @Param('childId') childId: string,
    @Query('period') period: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SettlementSummaryDto[]> {
    return this.billingService.getSettlementsForChild(childId, user.id, period || '2026-09');
  }
}
