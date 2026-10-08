import { CommerceRecommendationRequest } from './commerce-product.interface';

/**
 * Strict data minimization boundary for the commerce layer.
 * Enforces that only operational necessity attributes (category, size, quantity, dueDate, preferredBrand)
 * are passed to commerce providers.
 *
 * Explicitly strips and forbids PII, child names, health data, temperature, feeding records, notes, and user IDs.
 */
export class CommerceDataMinimizer {
  private static readonly FORBIDDEN_KEYS = [
    'child_name',
    'childName',
    'child_id',
    'childId',
    'guardian_id',
    'guardianId',
    'user_id',
    'userId',
    'line_sub',
    'temperature',
    'feeding',
    'sleep',
    'health',
    'medical',
    'notes',
    'caregiver_notes',
  ];

  /**
   * Sanitizes an arbitrary input payload into a minimal CommerceRecommendationRequest.
   * Throws an error or strips forbidden keys if present.
   */
  public static minimize(rawInput: Record<string, any>): CommerceRecommendationRequest {
    if (!rawInput || typeof rawInput !== 'object') {
      throw new Error('Invalid input payload for commerce recommendation');
    }

    // Check for explicit leaks of forbidden keys
    for (const key of Object.keys(rawInput)) {
      const lower = key.toLowerCase();
      for (const forbidden of CommerceDataMinimizer.FORBIDDEN_KEYS) {
        if (lower.includes(forbidden.toLowerCase())) {
          throw new Error(
            `Data minimization violation: forbidden key "${key}" detected in commerce payload. Commerce layer must not receive child or guardian personal/health data.`,
          );
        }
      }
    }

    const itemCategory = typeof rawInput.itemCategory === 'string'
      ? rawInput.itemCategory.trim()
      : typeof rawInput.item_name === 'string'
      ? rawInput.item_name.trim()
      : '其他';

    const size = typeof rawInput.size === 'string' && rawInput.size.trim()
      ? rawInput.size.trim().toUpperCase()
      : null;

    const quantity = typeof rawInput.quantity === 'string' && rawInput.quantity.trim()
      ? rawInput.quantity.trim()
      : null;

    let dueDate: Date | null = null;
    const rawDue = rawInput.dueDate || rawInput.due_at;
    if (rawDue) {
      const parsed = new Date(rawDue);
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed;
      }
    }

    const preferredBrand = typeof rawInput.preferredBrand === 'string' && rawInput.preferredBrand.trim()
      ? rawInput.preferredBrand.trim()
      : typeof rawInput.preferred_brand === 'string' && rawInput.preferred_brand.trim()
      ? rawInput.preferred_brand.trim()
      : null;

    // Return strictly typed minimal object with ONLY allowed fields
    return {
      itemCategory,
      size,
      quantity,
      dueDate,
      preferredBrand,
    };
  }
}
