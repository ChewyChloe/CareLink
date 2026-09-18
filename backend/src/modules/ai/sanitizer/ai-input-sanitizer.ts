/**
 * CareLink AI Input Sanitizer
 *
 * Implements data minimization and pseudonymization prior to sending text to external LLM providers.
 *
 * @notice Data Minimization & Pseudonymization Disclaimer:
 * This module performs regex-based heuristic masking and identifier replacement.
 * It strictly adheres to "data minimization / pseudonymization", NOT total cryptographic anonymization.
 * Real names and identifiers are pseudonymized with ephemeral tokens (e.g. CHILD_A, CHILD_B).
 */

export interface AuthorizedChildCandidate {
  id: string;
  displayAlias: string;
}

export interface SanitizeInputOptions {
  text: string;
  authorizedChildren?: AuthorizedChildCandidate[];
}

export interface SanitizedResult {
  sanitizedText: string;
  tokenToChildIdMap: Record<string, string>;
  childIdToTokenMap: Record<string, string>;
  availableTokens: string[];
}

export class AiInputSanitizer {
  // Common sensitive patterns in Taiwan / LINE messaging
  private static readonly PHONE_REGEX = /(\+?886\-?0?9\d{2}\-?\d{3}\-?\d{3}|09\d{2}\-?\d{3}\-?\d{3}|09\d{8})/g;
  private static readonly EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private static readonly TAIWAN_ID_REGEX = /\b[A-Z][1289]\d{8}\b/g;
  private static readonly LINE_USER_ID_REGEX = /U[0-9a-fA-F]{32}/g;
  private static readonly UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/gi;
  private static readonly TOKEN_SECRET_REGEX = /(?:token|bearer|secret|api_?key|password|jwt)[\s:=]+[A-Za-z0-9_\-\.]{12,}/gi;
  private static readonly ADDRESS_REGEX = /([臺台]?[北市中南高]|(?:基隆|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)[縣市])?[^\s,，。]+[路街道巷弄號樓]\d*([號樓])?/g;

  /**
   * Sanitizes input text by pseudonymizing child aliases and masking sensitive PII.
   */
  static sanitize(options: SanitizeInputOptions): SanitizedResult {
    let text = options.text || '';
    const tokenToChildIdMap: Record<string, string> = {};
    const childIdToTokenMap: Record<string, string> = {};
    const availableTokens: string[] = [];

    // 1. Pseudonymize known authorized children
    if (options.authorizedChildren && options.authorizedChildren.length > 0) {
      options.authorizedChildren.forEach((child, index) => {
        const token = `CHILD_${String.fromCharCode(65 + index)}`; // CHILD_A, CHILD_B, etc.
        tokenToChildIdMap[token] = child.id;
        childIdToTokenMap[child.id] = token;
        availableTokens.push(token);

        if (child.displayAlias && child.displayAlias.trim()) {
          const escapedAlias = child.displayAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const aliasRegex = new RegExp(escapedAlias, 'gi');
          text = text.replace(aliasRegex, token);
        }
      });
    }

    // 2. Generic children mentions fallback pseudonymization (e.g. 哥哥、妹妹、大寶、小寶、弟弟、寶寶)
    // If not already mapped, normalize common child aliases to CHILD_A / CHILD_B if authorized tokens exist
    if (availableTokens.length === 1) {
      // If only one child is authorized, common phrases like "寶寶", "弟弟", "妹妹" map to CHILD_A
      text = text.replace(/(寶寶|小孩|孩子)/g, availableTokens[0]);
    }

    // 3. Mask PII in descending order of specificity
    text = text.replace(this.TOKEN_SECRET_REGEX, '[SECRET_MASKED]');
    text = text.replace(this.LINE_USER_ID_REGEX, '[LINE_USER_MASKED]');
    text = text.replace(this.UUID_REGEX, '[UUID_MASKED]');
    text = text.replace(this.EMAIL_REGEX, '[EMAIL_MASKED]');
    text = text.replace(this.PHONE_REGEX, '[PHONE_MASKED]');
    text = text.replace(this.TAIWAN_ID_REGEX, '[ID_MASKED]');
    text = text.replace(this.ADDRESS_REGEX, '[ADDRESS_MASKED]');

    return {
      sanitizedText: text,
      tokenToChildIdMap,
      childIdToTokenMap,
      availableTokens,
    };
  }
}
