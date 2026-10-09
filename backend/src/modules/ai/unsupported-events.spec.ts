import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { FlexMessageBuilder } from '../line/flex/flex-message.builder';
describe('Unsupported AI facts never imply a saved care event (mock provider boundary)', () => {
  const service = new AiService({ get: () => undefined } as unknown as ConfigService);
  it('flags mixed feeding, diaper and temperature facts for manual entry', async () => {
    const result = await service.extractCareEvents({ text: '11:40喝150ml，換了尿布，耳溫36.5°C', forceProvider: 'mock', authorizedChildren: [{ id: 'B', displayAlias: '合成 B' }] });
    expect(result.output.requires_user_input).toBe(true);
    expect(result.output.unsupported).toEqual(expect.arrayContaining([{ reason: 'requires_manual_entry', event_type: 'DIAPER' }, { reason: 'requires_manual_entry', event_type: 'TEMPERATURE' }]));
  });
  it('flags an unrecognized message rather than implying recording success', async () => {
    const result = await service.extractCareEvents({ text: '想記錄這件尚未支援的照護事項', forceProvider: 'mock' });
    expect(result.output.requires_user_input).toBe(true); expect(result.output.unsupported?.[0].reason).toBe('requires_manual_entry');
  });
  it('renders manual-entry URI and omits confirmation postback for unsupported draft', () => {
    const card = FlexMessageBuilder.buildDraftConfirmationFlex({ id: 'synthetic-draft', status: 'NEEDS_INPUT', lock_version: 1, created_at: new Date(), expires_at: new Date(Date.now()+60000), items: [{ item_index: 0, event_type: 'TEMPERATURE', occurred_at: '', payload: {}, missing_fields: ['requires_manual_entry'] }] }, 'public-liff-id');
    const serialized = JSON.stringify(card); expect(serialized).toContain('改用手動記錄'); expect(serialized).toContain('/entry'); expect(serialized).not.toContain('action=confirm_draft');
  });
});
