import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AuthGuard, AuthenticatedUser } from './guards/auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { IsNotEmpty, IsString } from 'class-validator';
import { CsrfOriginGuard } from '../../common/guards/csrf-origin.guard';

export class LineSessionDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post(['auth/line-session', 'api/auth/line-session'])
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  async createLineSession(
    @Body() body: LineSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.idToken) {
      throw new BadRequestException('idToken is required');
    }

    const { token, user, cookieOptions } = await this.authService.loginWithLineIdToken(body.idToken);

    // Set HttpOnly + Secure + SameSite session cookie
    res.cookie(SessionService.COOKIE_NAME, token, cookieOptions);

    this.logger.log(`[Stage 6.5 Checkpoint] LIFF ID Token verified & CareLink HttpOnly session established (User=[MASKED], Provider=${user.line_provider_id})`);

    return {
      status: 'ok',
      user: {
        id: user.id,
        status: user.status,
      },
    };
  }

  @Post(['auth/logout', 'api/auth/logout'])
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      req.cookies?.[SessionService.COOKIE_NAME] ||
      (req.headers['authorization']?.startsWith('Bearer ')
        ? req.headers['authorization'].substring(7)
        : null);

    if (token) {
      const clearOptions = await this.authService.logout(token);
      res.cookie(SessionService.COOKIE_NAME, '', clearOptions);
    }

    return { status: 'ok' };
  }

  @Get(['me', 'api/me'])
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const me = await this.authService.getMe(user.id);
    this.logger.log(`[Stage 6.5 Checkpoint] /api/me retrieved successfully (grants: ${me.grants.length})`);
    return me;
  }
}
