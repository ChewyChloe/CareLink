import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from '../session.service';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AuthenticatedUser {
  id: string;
  line_provider_id: string;
  line_sub: string;
  status: string;
  display_name_ciphertext?: string | null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const session = await this.sessionService.validateSession(token);

    // Load active user from database
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        line_provider_id: true,
        line_sub: true,
        status: true,
        display_name_ciphertext: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is invalid or suspended');
    }

    (request as any).user = user;
    (request as any).session = session;
    return true;
  }

  private extractToken(request: Request): string | null {
    // 1. Check HttpOnly cookie
    if (request.cookies && request.cookies[SessionService.COOKIE_NAME]) {
      return request.cookies[SessionService.COOKIE_NAME];
    }

    // 2. Check Authorization Bearer header
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
