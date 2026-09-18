import { CareExtractionOutput } from '../schemas/care-extraction.schema';

export interface CareExtractionInput {
  sanitizedText: string;
  availableChildrenTokens: string[];
  referenceDate: string; // e.g. YYYY-MM-DD
  messageSentAt: Date;
}

export interface CareExtractionResult {
  output: CareExtractionOutput;
  promptVersion: string;
  schemaVersion: string;
  modelId: string;
  latencyMs: number;
}

/**
 * Common abstraction for Care Event AI extraction providers.
 * Decouples Care domain from specific AI model vendors (Gemini, Claude, Mock, etc.)
 */
export interface CareExtractionProvider {
  extract(input: CareExtractionInput): Promise<CareExtractionResult>;
}
