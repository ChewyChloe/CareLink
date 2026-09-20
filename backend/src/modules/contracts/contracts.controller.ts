import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ContractsService, ContractDetailsDto } from './contracts.service';

@Controller()
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  /**
   * Public preview contract endpoint for Demo showcase.
   */
  @Get(['contracts/demo-showcase', 'api/contracts/demo-showcase'])
  @HttpCode(HttpStatus.OK)
  getDemoContract(): ContractDetailsDto {
    return this.contractsService.getDemoContract('demo_ty', '湯圓');
  }

  /**
   * Retrieves the current applicable contract version for a specific child.
   */
  @Get(['children/:childId/contract', 'api/children/:childId/contract'])
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getContractForChild(
    @Param('childId') childId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContractDetailsDto> {
    return this.contractsService.getContractForChild(childId, user.id);
  }
}
