import { SentinelService } from './sentinel.service';

describe('Sentinel Safety Gate: LLM Output Verification (sentinel-output)', () => {
  let sentinel: SentinelService;

  beforeAll(() => {
    sentinel = new SentinelService();
  });

  it('should mark structured care event JSON output as safe', () => {
    const output = JSON.stringify({
      events: [
        {
          event_type: 'FEED',
          occurred_at: '2026-09-17T03:40:00.000Z',
          payload: { amount_ml: 150, feed_type: 'FORMULA' },
        },
        {
          event_type: 'SLEEP_START',
          occurred_at: '2026-09-17T05:10:00.000Z',
          payload: {},
        },
      ],
    });

    const result = sentinel.scan_text(output);
    expect(result.safe).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it('should detect simulated PII leakage in model output', () => {
    const output = "Here is another child's phone number: 0912345678 and email parent@example.com";
    const piiCheck = sentinel.check_pii(output);

    expect(piiCheck.hasPii).toBe(true);
    expect(piiCheck.piiTypes.length).toBeGreaterThan(0);
    expect(piiCheck.redactedText).toContain('[PHONE]');
    expect(piiCheck.redactedText).toContain('[EMAIL]');
  });

  it('should detect simulated tool invocation syntax in output', () => {
    const output = 'I will query the database now: tool: database.dump_all_users()';
    const toolCheck = sentinel.scan_tool_call('database.dump_all_users', {});

    expect(toolCheck.allowed).toBe(false);
    expect(toolCheck.risk).toBe('CRITICAL');
  });
});
