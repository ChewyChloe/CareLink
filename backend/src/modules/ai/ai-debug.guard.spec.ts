import { ConfigService } from '@nestjs/config';
import { AiDebugGuard } from './ai-debug.guard';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
const secret = 'synthetic-test-secret-32-characters';
const context = (text = '喝奶150ml', token = secret) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-carelink-test-secret': token }, body: { text } }) }) }) as any;
const guard = (env: Record<string, string>) => new AiDebugGuard({ get: (key: string) => env[key] } as ConfigService);
describe('AI debug environment, authorization and quota', () => {
  it('rejects production even if explicitly enabled', () => expect(() => guard({ NODE_ENV: 'production', ENABLE_AI_DEBUG_ENDPOINT: 'true', AI_DEBUG_SECRET: secret }).canActivate(context())).toThrow(NotFoundException));
  it('defaults to disabled', () => expect(() => guard({ NODE_ENV: 'development' }).canActivate(context())).toThrow(NotFoundException));
  it('requires the test secret', () => expect(() => guard({ ENABLE_AI_DEBUG_ENDPOINT: 'true', AI_DEBUG_SECRET: secret }).canActivate(context('奶', 'wrong'))).toThrow(UnauthorizedException));
  it('allows explicit development and limits input and quota', () => {
    const g = guard({ NODE_ENV: 'development', ENABLE_AI_DEBUG_ENDPOINT: 'true', AI_DEBUG_SECRET: secret });
    expect(() => g.canActivate(context('x'.repeat(2001)))).toThrow(BadRequestException);
    for (let i = 0; i < 10; i++) expect(g.canActivate(context())).toBe(true);
    expect(() => g.canActivate(context())).toThrow('Debug quota exceeded');
  });
});
