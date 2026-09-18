import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { LineSignatureService } from './line-signature.service';
import { LineWebhookService } from './line-webhook.service';
import { LineWebhookPayload } from './dto/line-webhook.dto';

@Controller()
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private readonly signatureService: LineSignatureService,
    private readonly webhookService: LineWebhookService,
  ) {}

  @Post(['webhooks/line', 'api/webhooks/line'])
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-line-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // 1. Extract raw body buffer
    let rawBody = req.rawBody;
    if (!rawBody && req.body) {
      if (Buffer.isBuffer(req.body)) {
        rawBody = req.body;
      } else if (typeof req.body === 'string') {
        rawBody = Buffer.from(req.body, 'utf8');
      }
    }

    // 2. Verify signature using HMAC-SHA256
    this.signatureService.verifySignature(signature, rawBody, requestId);

    // 3. Parse JSON payload from verified raw body
    let payload: LineWebhookPayload;
    try {
      if (rawBody) {
        payload = JSON.parse(rawBody.toString('utf8'));
      } else {
        payload = req.body as LineWebhookPayload;
      }
    } catch {
      throw new BadRequestException('Malformed webhook JSON payload');
    }

    if (!payload || !Array.isArray(payload.events)) {
      throw new BadRequestException('Invalid webhook payload structure');
    }

    // 4. Process events transactionally
    const results = await this.webhookService.handleWebhook(payload);

    // 5. ACK only after database persistence succeeds
    return {
      status: 'ok',
      processed: results.length,
      results,
    };
  }
}
