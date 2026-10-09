import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiDebugGuard } from './ai-debug.guard';
import { AiService } from './ai.service';
import { HTTP_PREFIX_OPTIONS } from '../../http-prefix';
describe('AI debug HTTP gate (synthetic extraction boundary)', () => {
  it('rejects production and unauthorized development, permits explicit authenticated development', async () => {
    const secret = 'synthetic-test-secret-32-characters';
    const environment: Record<string, string> = { NODE_ENV: 'production', ENABLE_AI_DEBUG_ENDPOINT: 'true', AI_DEBUG_SECRET: secret };
    const extract = jest.fn().mockResolvedValue({ modelId: 'mock', promptVersion: 'test', schemaVersion: 'test', latencyMs: 0, output: { events: [] } });
    const module = await Test.createTestingModule({ controllers: [AiController], providers: [AiDebugGuard,
      { provide: ConfigService, useValue: { get: (key: string) => environment[key] } },
      { provide: AiService, useValue: { extractCareEvents: extract } },
    ] }).compile();
    const app = module.createNestApplication(); app.setGlobalPrefix('api', HTTP_PREFIX_OPTIONS); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })); await app.listen(0,'127.0.0.1');
    const base = await app.getUrl();
    const post = (withSecret: boolean, text='合成測試文字') => fetch(base+'/api/ai/extract-test', { method:'POST', headers:{'Content-Type':'application/json',...(withSecret?{'x-carelink-test-secret':secret}:{})},body:JSON.stringify({text,forceProvider:'mock'}) });
    try {
      expect((await post(false)).status).toBe(404); expect((await post(true)).status).toBe(404); expect(extract).not.toHaveBeenCalled();
      environment.NODE_ENV='development'; expect((await post(false)).status).toBe(401);
      const allowed=await post(true); expect(allowed.status).toBe(200); expect((await allowed.json()).modelId).toBe('mock');
      expect((await post(true,'x'.repeat(2001))).status).toBe(400); expect(extract).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });
});
