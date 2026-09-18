import {
  SentinelGuard,
  ScanResult,
  Finding,
  RiskLevel,
  PromptInjectionScanner,
  PIIScanner,
  ToolUseScanner,
  SecretsScanner,
  CodeScanner,
  DependencyScanner,
  EvalRunner,
  EvalCase,
  EvalReport,
} from './sentinel-sdk';

export interface ScanToolCallResult {
  toolName: string;
  allowed: boolean;
  risk: RiskLevel;
  blockReason?: string;
  findings: Finding[];
}

export interface CheckPiiResult {
  hasPii: boolean;
  redactedText: string;
  piiTypes: string[];
  findings: Finding[];
}

export class SentinelService {
  private guard: SentinelGuard;

  constructor() {
    this.guard = SentinelGuard.default();

    // Enhance prompt injection scanner with Traditional Chinese & Domain escalation patterns
    this.guard.addScanner({
      name: 'domain_prompt_injection',
      scan(text: string): Finding[] {
        const findings: Finding[] = [];
        const domainPatterns = [
          {
            name: 'zh_tw_instruction_override',
            regex: /(把|將)?(之前|前面|系統|原本|既有|所有|全部)?的?(規則|指示|指令|設定|提示|約束|限制|安全規範|安全指示)(忘掉|忘記|忽略|忽視|無視|解除|跳過|撤銷|繞過|覆蓋)/i,
            risk: 'CRITICAL' as RiskLevel,
            description: 'Traditional Chinese prompt injection: instruction override',
          },
          {
            name: 'zh_tw_reverse_override',
            regex: /(忘掉|忘記|忽略|忽視|無視|解除|跳過|撤銷|繞過|覆蓋|無須遵守|不用遵守|不需要遵守).*?(規則|指示|指令|設定|提示|約束|限制|規範|合約|檢查|安全)/i,
            risk: 'CRITICAL' as RiskLevel,
            description: 'Traditional Chinese prompt injection: instruction override',
          },
          {
            name: 'admin_privilege_escalation',
            regex: /(grant\s+(me\s+)?admin|set\s+(\w+\s+)?fee\s+to\s+0|elevate\s+(\w+\s+)?role|super_admin|grant_role|role\s*:\s*admin|setchildcarefee)/i,
            risk: 'CRITICAL' as RiskLevel,
            description: 'Administrative privilege escalation / fee tampering attempt',
          },
          {
            name: 'data_exfiltration_request',
            regex: /(reveal|show|display|print|output|dump|leak|export|prompt)\s+(every|all)?\s*(child('s)?|children|family|families|user|database|db|tenant|system)\s*(data|info|information|record|prompt)?/i,
            risk: 'CRITICAL' as RiskLevel,
            description: 'Cross-tenant child/family data exfiltration request',
          },
          {
            name: 'zh_tw_data_exfiltration',
            regex: /(顯示|輸出|列出|提供|導出|洩漏|公開|給我).*?(名冊|聯絡|個資|密碼|資料庫|所有家庭|全部家庭|所有幼兒|全部幼兒)/i,
            risk: 'CRITICAL' as RiskLevel,
            description: 'Traditional Chinese data exfiltration request',
          },
          {
            name: 'sql_injection_attempt',
            regex: /('|\"|;)\s*(DROP\s+TABLE|SELECT\s+.*FROM|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+.*SET|UNION\s+SELECT|--|\/\*)/i,
            risk: 'HIGH' as RiskLevel,
            description: 'SQL injection attack pattern in untrusted text',
          },
        ];

        for (const p of domainPatterns) {
          const m = text.match(p.regex);
          if (m) {
            findings.push({
              scanner: 'domain_prompt_injection',
              category: 'prompt_injection',
              description: p.description,
              risk: p.risk,
              span: m.index !== undefined ? [m.index, m.index + m[0].length] : undefined,
              metadata: { pattern: p.name, attack_vector: p.description },
            });
          }
        }
        return findings;
      },
    });
  }

  /**
   * 1. scan_text: Full safety scan using SentinelGuard
   */
  public scan_text(text: string): ScanResult {
    return this.guard.scan(text);
  }

  /**
   * 2. scan_tool_call: Enforces CareLink tool-safety invariants.
   * In CareLink, CareExtractionProvider has a strict NO_TOOLS policy.
   */
  public scan_tool_call(toolName: string, args: Record<string, any> = {}): ScanToolCallResult {
    const rawText = `${toolName} ${JSON.stringify(args)}`;
    const findings: Finding[] = [];

    // CareLink architecture: Extraction provider is strictly isolated and cannot execute external tools
    const prohibitedTools = [
      'shell', 'bash', 'terminal', 'cmd', 'exec', 'database', 'sql', 'query',
      'dump_all_users', 'eval', 'curl', 'wget', 'fetch', 'rm', 'system',
    ];

    const isProhibited = prohibitedTools.some((pt) =>
      toolName.toLowerCase().includes(pt) || JSON.stringify(args).toLowerCase().includes(pt),
    );

    if (isProhibited) {
      findings.push({
        scanner: 'tool_safety',
        category: 'tool_abuse',
        description: `Prohibited tool invocation detected in AI extraction boundary: '${toolName}'`,
        risk: 'CRITICAL',
        metadata: { toolName, args },
      });
      return {
        toolName,
        allowed: false,
        risk: 'CRITICAL',
        blockReason: `CareExtractionProvider enforces a strict NO_TOOLS policy. Tool '${toolName}' is blocked.`,
        findings,
      };
    }

    const textScan = this.guard.scan(rawText);
    const criticalFindings = textScan.findings.filter((f) => f.risk === 'CRITICAL' || f.risk === 'HIGH');

    if (criticalFindings.length > 0) {
      return {
        toolName,
        allowed: false,
        risk: criticalFindings[0].risk,
        blockReason: criticalFindings[0].description,
        findings: criticalFindings,
      };
    }

    return {
      toolName,
      allowed: true,
      risk: 'NONE',
      findings: [],
    };
  }

  /**
   * 3. check_pii: Detects and redacts standard PII as well as Taiwan-specific PII (Taiwan Mobile & Taiwan ID)
   */
  public check_pii(text: string): CheckPiiResult {
    const baseScan = this.guard.scan(text);
    const piiFindings: Finding[] = baseScan.findings.filter(
      (f) => f.category === 'pii' || f.scanner === 'secrets',
    );

    // Taiwan-specific patterns:
    // Taiwan Mobile Phone: 09xx-xxx-xxx or 09xxxxxxxx
    const twPhoneRegex = /\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/g;
    let match: RegExpExecArray | null;
    while ((match = twPhoneRegex.exec(text)) !== null) {
      piiFindings.push({
        scanner: 'tw_pii',
        category: 'pii',
        description: 'Taiwan mobile phone number detected',
        risk: 'MEDIUM',
        span: [match.index, match.index + match[0].length],
        metadata: { pii_type: 'PHONE', pattern: 'tw_mobile' },
      });
    }

    // Taiwan National ID: 1 uppercase letter + 1 or 2 + 8 digits
    const twIdRegex = /\b[A-Z][12]\d{8}\b/g;
    while ((match = twIdRegex.exec(text)) !== null) {
      piiFindings.push({
        scanner: 'tw_pii',
        category: 'pii',
        description: 'Taiwan National ID number detected',
        risk: 'CRITICAL',
        span: [match.index, match.index + match[0].length],
        metadata: { pii_type: 'NATIONAL_ID', pattern: 'tw_id' },
      });
    }

    // General API Key / Secret Token pattern: e.g. sk-..., AKIA..., ghp_...
    const apiKeyRegex = /\b(sk-[a-zA-Z0-9_\-]{16,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36})\b/g;
    while ((match = apiKeyRegex.exec(text)) !== null) {
      piiFindings.push({
        scanner: 'api_key',
        category: 'pii',
        description: 'API key token detected',
        risk: 'CRITICAL',
        span: [match.index, match.index + match[0].length],
        metadata: { pii_type: 'API_KEY', pattern: 'api_token' },
      });
    }

    // Redact text from end to beginning to preserve span indices
    let redacted = text;
    const sortedFindings = [...piiFindings]
      .filter((f) => f.span)
      .sort((a, b) => b.span![0] - a.span![0]);

    const piiTypesSet = new Set<string>();

    for (const f of sortedFindings) {
      const [start, end] = f.span!;
      const label = (f.metadata?.pii_type as string) || (f.metadata?.provider ? 'API_KEY' : 'PII');
      piiTypesSet.add(label);
      redacted = redacted.substring(0, start) + `[${label}]` + redacted.substring(end);
    }

    return {
      hasPii: piiFindings.length > 0,
      redactedText: redacted,
      piiTypes: Array.from(piiTypesSet),
      findings: piiFindings,
    };
  }

  /**
   * 4. get_risk_report: Generates a detailed markdown report
   */
  public get_risk_report(scanResults: ScanResult[]): string {
    const total = scanResults.length;
    const blocked = scanResults.filter((r) => r.blocked).length;
    const safe = scanResults.filter((r) => r.safe).length;
    const critical = scanResults.filter((r) => r.risk === 'CRITICAL').length;
    const high = scanResults.filter((r) => r.risk === 'HIGH').length;
    const medium = scanResults.filter((r) => r.risk === 'MEDIUM').length;

    return `# Sentinel AI Safety Risk Report
- Date: ${new Date().toISOString()}
- Total Scans: ${total}
- Safe: ${safe}
- Blocked: ${blocked}
- Critical: ${critical}
- High: ${high}
- Medium: ${medium}
`;
  }
}
