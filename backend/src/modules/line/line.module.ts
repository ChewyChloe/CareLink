import { Module, forwardRef } from '@nestjs/common';
import { LineWebhookController } from './line-webhook.controller';
import { LineWebhookService } from './line-webhook.service';
import { LineSignatureService } from './line-signature.service';
import { MessageEncryptionService } from './crypto/message-encryption.service';

import { LineMessagingService } from './line-messaging.service';
import { CareModule } from '../care/care.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [CareModule, forwardRef(() => JobsModule)],
  controllers: [LineWebhookController],
  providers: [
    LineWebhookService,
    LineSignatureService,
    MessageEncryptionService,
    LineMessagingService,
  ],
  exports: [LineWebhookService, MessageEncryptionService, LineMessagingService],
})
export class LineModule {}
