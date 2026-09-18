import { SentinelService } from './sentinel.service';

describe('Sentinel Safety Gate: PII Detection & Redaction (sentinel-pii)', () => {
  let sentinel: SentinelService;

  beforeAll(() => {
    sentinel = new SentinelService();
  });

  it('should detect and redact Taiwan mobile phone number', () => {
    const text = '媽媽電話 0912345678 請晚點聯絡';
    const result = sentinel.check_pii(text);

    expect(result.hasPii).toBe(true);
    expect(result.piiTypes).toContain('PHONE');
    expect(result.redactedText).toContain('[PHONE]');
    expect(result.redactedText).not.toContain('0912345678');
  });

  it('should detect and redact email address', () => {
    const text = '家長信箱是 test@example.com';
    const result = sentinel.check_pii(text);

    expect(result.hasPii).toBe(true);
    expect(result.piiTypes).toContain('EMAIL');
    expect(result.redactedText).toContain('[EMAIL]');
    expect(result.redactedText).not.toContain('test@example.com');
  });

  it('should detect and redact API key token', () => {
    const text = 'API_KEY=sk-test-example12345678901234567890';
    const result = sentinel.check_pii(text);

    expect(result.hasPii).toBe(true);
    expect(result.redactedText).not.toContain('sk-test-example12345678901234567890');
  });

  it('should detect and redact Taiwan National ID number', () => {
    const text = '幼兒健保卡身分證 A123456789 請核對';
    const result = sentinel.check_pii(text);

    expect(result.hasPii).toBe(true);
    expect(result.piiTypes).toContain('NATIONAL_ID');
    expect(result.redactedText).toContain('[NATIONAL_ID]');
    expect(result.redactedText).not.toContain('A123456789');
  });

  it('should leave benign text without PII unredacted', () => {
    const text = '11:40喝150ml，13:10午睡';
    const result = sentinel.check_pii(text);

    expect(result.hasPii).toBe(false);
    expect(result.redactedText).toBe(text);
  });
});
