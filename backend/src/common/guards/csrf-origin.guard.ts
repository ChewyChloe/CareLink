import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);
  private readonly allowedOrigins: string[];

  constructor(private readonly configService: ConfigService) {
    const rawFrontend =
      this.configService.get<string>('FRONTEND_ORIGIN') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:5173';
    const splitOrigins = rawFrontend.split(',').map((s) => s.trim().replace(/\/$/, ''));
    this.allowedOrigins = Array.from(
      new Set([
        ...splitOrigins,
        ...(this.configService.get('NODE_ENV') === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']),
      ]),
    );
  }

  private isOriginAllowed(originStr: string): boolean {
    const sanitized = originStr.replace(/\/$/, '');
    return this.allowedOrigins.includes(sanitized);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Safe read methods bypass CSRF/Origin check
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // LINE Webhook endpoints use HMAC signature verification, exempt from origin check
    const path = request.path || request.url;
    if (path.includes('webhooks/line')) {
      return true;
    }

    const origin = request.headers['origin'] as string;
    const referer = request.headers['referer'] as string;

    // Check Origin header first
    if (origin) {
      if (this.isOriginAllowed(origin)) {
        return true;
      }
      this.logger.warn(`Forbidden cross-origin request: origin '${origin}' is not allowed`);
      throw new ForbiddenException('Cross-origin request rejected');
    }

    // Fallback to Referer header if Origin is absent
    if (referer) {
      try {
        const parsedUrl = new URL(referer);
        const refererOrigin = `${parsedUrl.protocol}//${parsedUrl.host}`;
        if (this.isOriginAllowed(refererOrigin)) {
          return true;
        }
      } catch {
        // Invalid referer URL
      }
      this.logger.warn(`Forbidden cross-origin request: referer '${referer}' is not allowed`);
      throw new ForbiddenException('Cross-origin referer rejected');
    }

    // For local development or non-browser API test clients without origin, allow if not in production
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProd) {
      return true;
    }

    throw new ForbiddenException('Missing Origin or Referer header on mutating request');
  }
}
