import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareExtractionProvider, CareExtractionResult } from './provider/care-extraction-provider.interface';
import { GeminiCareExtractionProvider } from './provider/gemini-care-extraction.provider';
import { MockCareExtractionProvider } from './provider/mock-care-extraction.provider';
import { AiInputSanitizer, AuthorizedChildCandidate } from './sanitizer/ai-input-sanitizer';
import { DEFAULT_GEMINI_MODEL } from './prompts/care-extraction.prompt';

export interface ExtractOptions {
  text: string;
  authorizedChildren?: AuthorizedChildCandidate[];
  referenceDate?: string;
  messageSentAt?: Date;
  forceProvider?: 'gemini' | 'mock';
}

export interface ExtractResultWithSanitization extends CareExtractionResult {
  tokenToChildIdMap: Record<string, string>;
  childIdToTokenMap: Record<string, string>;
  availableTokens: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly geminiProvider: GeminiCareExtractionProvider;
  private readonly mockProvider: MockCareExtractionProvider;
  private readonly hasGeminiKey: boolean;

  constructor(private readonly configService: ConfigService) {
    this.geminiProvider = new GeminiCareExtractionProvider(configService);
    this.mockProvider = new MockCareExtractionProvider();

    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.hasGeminiKey = Boolean(apiKey.trim() && !apiKey.startsWith('your_'));
  }

  /**
   * Sanitizes input, pseudonymizes child identities, and executes care event extraction.
   *
   * @audit Strict Privacy Rule:
   *        Never logs raw user messages, prompt contents, or model outputs containing user content.
   */
  async extractCareEvents(options: ExtractOptions): Promise<ExtractResultWithSanitization> {
    const referenceDate = options.referenceDate || new Date().toISOString().split('T')[0];
    const messageSentAt = options.messageSentAt || new Date();

    // 1. Sanitize & Minimization
    const sanitized = AiInputSanitizer.sanitize({
      text: options.text,
      authorizedChildren: options.authorizedChildren,
    });

    // 2. Select Provider
    let provider: CareExtractionProvider;
    if (options.forceProvider === 'gemini') {
      provider = this.geminiProvider;
    } else if (options.forceProvider === 'mock') {
      provider = this.mockProvider;
    } else {
      provider = this.hasGeminiKey ? this.geminiProvider : this.mockProvider;
    }

    // 3. Execute Extraction
    const extractionResult = await provider.extract({
      sanitizedText: sanitized.sanitizedText,
      availableChildrenTokens: sanitized.availableTokens,
      referenceDate,
      messageSentAt,
    });

    // 4. Safe Logging (Compliant with Privacy Rule)
    this.logger.log({
      msg: 'Care extraction completed',
      modelId: extractionResult.modelId,
      promptVersion: extractionResult.promptVersion,
      schemaVersion: extractionResult.schemaVersion,
      latencyMs: extractionResult.latencyMs,
      eventCount: extractionResult.output.events.length,
      requiresUserInput: extractionResult.output.requires_user_input,
    });

    return {
      ...extractionResult,
      tokenToChildIdMap: sanitized.tokenToChildIdMap,
      childIdToTokenMap: sanitized.childIdToTokenMap,
      availableTokens: sanitized.availableTokens,
    };
  }

  getGeminiStatus(): { configured: boolean; model: string; verificationStatus: string } {
    const configuredModel = this.configService.get<string>('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    return {
      configured: this.hasGeminiKey,
      model: configuredModel.trim(),
      verificationStatus: this.hasGeminiKey
        ? 'IMPLEMENTATION_COMPLETE'
        : 'LIVE_GEMINI_VERIFICATION_PENDING',
    };
  }
}
