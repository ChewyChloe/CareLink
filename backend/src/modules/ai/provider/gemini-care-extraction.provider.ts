import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  CareExtractionProvider,
  CareExtractionInput,
  CareExtractionResult,
} from './care-extraction-provider.interface';
import {
  CareExtractionOutput,
  CareExtractionOutputSchema,
  GeminiCareExtractionJsonSchema,
} from '../schemas/care-extraction.schema';
import {
  CARE_EVENT_EXTRACTION_PROMPT_METADATA,
  DEFAULT_GEMINI_MODEL,
  buildCareEventExtractionSystemPrompt,
} from '../prompts/care-extraction.prompt';

@Injectable()
export class GeminiCareExtractionProvider implements CareExtractionProvider {
  private readonly logger = new Logger(GeminiCareExtractionProvider.name);
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly aiClient: GoogleGenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    const configuredModel = this.configService.get<string>('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    this.modelName = configuredModel.trim();

    if (this.apiKey && this.apiKey.trim() && !this.apiKey.startsWith('your_')) {
      this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  async extract(input: CareExtractionInput): Promise<CareExtractionResult> {
    if (!this.aiClient) {
      throw new Error(
        'GEMINI_API_KEY is not configured or pending live verification. Status: LIVE_GEMINI_VERIFICATION_PENDING',
      );
    }

    const systemPrompt = buildCareEventExtractionSystemPrompt(
      input.availableChildrenTokens,
      input.referenceDate,
    );

    const startTime = Date.now();
    let attempts = 0;
    const maxRetries = 2;
    let lastError: any = null;

    while (attempts <= maxRetries) {
      attempts++;
      try {
        const response = await this.aiClient.models.generateContent({
          model: this.modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: `Extract care events from sanitized message:\n"${input.sanitizedText}"` }],
            },
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: GeminiCareExtractionJsonSchema as any,
          },
        });

        const latencyMs = Date.now() - startTime;
        const rawJsonText = response.text?.trim() || '{}';

        // Runtime Zod Schema validation
        let parsedJson: any;
        try {
          parsedJson = JSON.parse(rawJsonText);
        } catch (jsonErr) {
          throw new Error('Gemini response was not valid JSON');
        }

        const parseResult = CareExtractionOutputSchema.safeParse(parsedJson);
        if (!parseResult.success) {
          throw new Error(`Gemini output schema validation failed: ${parseResult.error.message}`);
        }

        this.logger.log(
          `Gemini extraction successful: model=${this.modelName}, latencyMs=${latencyMs}, eventCount=${parseResult.data.events.length}`,
        );

        return {
          output: parseResult.data,
          promptVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.promptVersion,
          schemaVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.schemaVersion,
          modelId: this.modelName,
          latencyMs,
        };
      } catch (err: any) {
        lastError = err;
        const isRetryable =
          err?.status === 429 ||
          err?.status === 500 ||
          err?.status === 503 ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'ECONNRESET';

        if (isRetryable && attempts <= maxRetries) {
          const backoffMs = attempts * 1000;
          this.logger.warn(
            `Gemini transient error on attempt ${attempts}. Retrying in ${backoffMs}ms... (Error status: ${err?.status || err?.code})`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        break;
      }
    }

    const latencyMs = Date.now() - startTime;
    this.logger.error(
      `Gemini extraction failed after ${attempts} attempts: latencyMs=${latencyMs}, error=${lastError?.message || 'Unknown'}`,
    );
    throw lastError;
  }
}
