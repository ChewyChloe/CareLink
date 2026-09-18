import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class LineSignatureService {
  private readonly logger = new Logger(LineSignatureService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Verifies the LINE webhook HMAC-SHA256 signature against the exact raw request body buffer.
   *
   * @param signature The base64 signature from the `x-line-signature` header.
   * @param rawBody The unparsed raw body Buffer.
   * @param requestId Optional request ID for sanitized logging.
   */
  verifySignature(signature: string | undefined, rawBody: Buffer | undefined, requestId?: string): boolean {
    if (!signature) {
      this.logger.warn(JSON.stringify({
        requestId: requestId || 'unknown',
        eventCategory: 'line_webhook',
        signature_missing: true,
      }));
      throw new BadRequestException('Missing X-Line-Signature header');
    }

    if (!rawBody || rawBody.length === 0) {
      this.logger.warn(JSON.stringify({
        requestId: requestId || 'unknown',
        eventCategory: 'line_webhook',
        raw_body_missing: true,
      }));
      throw new BadRequestException('Missing or empty raw request body');
    }

    const channelSecret = this.configService.get<string>('LINE_CHANNEL_SECRET');
    if (!channelSecret) {
      this.logger.error('LINE_CHANNEL_SECRET is not configured in server environment');
      throw new UnauthorizedException('Channel secret not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', channelSecret)
      .update(rawBody)
      .digest('base64');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      // Log sanitized message: NO raw body, NO signature, NO secret
      this.logger.warn(JSON.stringify({
        requestId: requestId || 'unknown',
        eventCategory: 'line_webhook',
        signature_invalid: true,
      }));
      throw new UnauthorizedException('Invalid LINE webhook signature');
    }

    return true;
  }
}
