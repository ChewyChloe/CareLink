import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException, BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AiDebugGuard implements CanActivate {
  private windowStart = 0;
  private requests = 0;
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('ENABLE_AI_DEBUG_ENDPOINT') !== 'true') throw new NotFoundException();
    const request = context.switchToHttp().getRequest();
    const expected = String(this.config.get('AI_DEBUG_SECRET') || '');
    const provided = request.headers['x-carelink-test-secret'];
    if (expected.length < 32 || typeof provided !== 'string' || Buffer.byteLength(expected) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) throw new UnauthorizedException();
    if (typeof request.body?.text !== 'string' || !request.body.text.trim() || request.body.text.length > 2000) throw new BadRequestException('text must contain 1–2000 characters');
    if (Date.now() - this.windowStart >= 60000) { this.windowStart = Date.now(); this.requests = 0; }
    if (++this.requests > 10) throw new HttpException('Debug quota exceeded', 429);
    return true;
  }
}
