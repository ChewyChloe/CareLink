import { Test } from '@nestjs/testing';
import { LineWebhookController } from './line-webhook.controller';
import { LineSignatureService } from './line-signature.service';
import { LineWebhookService } from './line-webhook.service';
import { HTTP_PREFIX_OPTIONS } from '../../http-prefix';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
describe('Bootstrap webhook HTTP paths with real HMAC guard', () => {
  it('serves both documented paths and rejects obsolete path and invalid signatures', async () => {
    const secret = 'synthetic-test-channel-secret';
    const module = await Test.createTestingModule({ controllers: [LineWebhookController], providers: [LineSignatureService,
      { provide: ConfigService, useValue: { get: (key: string) => key === 'LINE_CHANNEL_SECRET' ? secret : undefined } },
      { provide: LineWebhookService, useValue: { handleWebhook: async () => [] } },
    ] }).compile();
    const app = module.createNestApplication({ rawBody: true }); app.setGlobalPrefix('api', HTTP_PREFIX_OPTIONS); await app.listen(0, '127.0.0.1');
    try {
      const base = await app.getUrl(); const body = JSON.stringify({ events: [] });
      const signature = createHmac('sha256', secret).update(body).digest('base64');
      for (const path of ['/webhooks/line', '/api/webhooks/line']) {
        expect((await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-line-signature': signature }, body })).status).toBe(200);
        expect((await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status).toBeGreaterThanOrEqual(400);
      }
      expect((await fetch(base + '/api/line/webhook', { method: 'POST' })).status).toBe(404);
    } finally { await app.close(); }
  });
});
