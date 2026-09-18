import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChildrenService } from './children.service';
import { AuthGuard, AuthenticatedUser } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CsrfOriginGuard } from '../../common/guards/csrf-origin.guard';
import { AccessGrantGuard } from './guards/access-grant.guard';

export class CreateChildDto {
  displayAlias!: string;
  birthDate?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class ChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  @Post(['children', 'api/children'])
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.CREATED)
  async createChild(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateChildDto,
  ) {
    return this.childrenService.createChild(user.id, body.displayAlias, body.birthDate);
  }

  @Get(['children/overview', 'api/children/overview'])
  @HttpCode(HttpStatus.OK)
  async getChildrenOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.childrenService.getChildrenOverview(user.id);
  }

  @Get(['children', 'api/children'])
  @HttpCode(HttpStatus.OK)
  async getChildren(@CurrentUser() user: AuthenticatedUser) {
    return this.childrenService.getChildren(user.id);
  }

  @Get(['children/:id', 'api/children/:id'])
  @UseGuards(AccessGrantGuard)
  @HttpCode(HttpStatus.OK)
  async getChildById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') childId: string,
  ) {
    return this.childrenService.getChildById(user.id, childId);
  }
}
