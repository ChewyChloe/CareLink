import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);
  private readonly replyEndpoint = 'https://api.line.me/v2/bot/message/reply';
  private readonly pushEndpoint = 'https://api.line.me/v2/bot/message/push';

  constructor(private readonly configService: ConfigService) {}

  private getAccessToken(): string | null {
    return this.configService.get<string>('LINE_CHANNEL_ACCESS_TOKEN') || null;
  }

  /**
   * Replies to a user message using LINE replyToken.
   */
  async replyFlexMessage(
    replyToken: string,
    altText: string,
    flexContainer: Record<string, any>,
  ): Promise<boolean> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN missing; reply skipped');
      return false;
    }

    try {
      const res = await fetch(this.replyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [
            {
              type: 'flex',
              altText,
              contents: flexContainer,
            },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(`LINE reply failed (HTTP ${res.status}): ${errText}`);
        return false;
      }

      this.logger.log('LINE reply sent successfully');
      return true;
    } catch (err: any) {
      this.logger.error(`Error sending LINE reply: ${err.message}`);
      return false;
    }
  }

  /**
   * Pushes a Flex message directly to a LINE user ID.
   */
  async pushFlexMessage(
    toUserId: string,
    altText: string,
    flexContainer: Record<string, any>,
  ): Promise<boolean> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN missing; push skipped');
      return false;
    }

    try {
      const res = await fetch(this.pushEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: toUserId,
          messages: [
            {
              type: 'flex',
              altText,
              contents: flexContainer,
            },
          ],
        }),
      });

      const lineRequestId = res.headers.get('x-line-request-id') || 'none';

      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `[Stage 6.5 Checkpoint] LINE Messaging API push failed: HTTP ${res.status}, lineRequestId=${lineRequestId}, error=${errText}`,
        );
        return false;
      }

      this.logger.log(
        `[Stage 6.5 Checkpoint] LINE Messaging API push succeeded: HTTP ${res.status}, lineRequestId=${lineRequestId}`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(`[Stage 6.5 Checkpoint] Error sending LINE push: ${err.message}`);
      return false;
    }
  }
}
