import { CommerceRecommendationRequest } from './commerce-product.interface';

/**
 * Strict allowlist construction boundary for the commerce layer.
 *
 * Rules:
 * 1. Commerce layer MUST ONLY receive:
 *    - itemCategory
 *    - size
 *    - quantity
 *    - dueAt
 *    - preferredBrand
 * 2. It is STRICTLY FORBIDDEN to pass a full database entity (e.g. SupplyTask)
 *    and filter it after the fact.
 * 3. The request must be constructed via explicit allowlist instantiation.
 */
export class CommerceDataMinimizer {
  public static readonly ALLOWLIST_KEYS = new Set([
    'itemCategory',
    'size',
    'quantity',
    'dueAt',
    'dueDate', // alias
    'preferredBrand',
  ]);

  /**
   * Pure allowlist constructor.
   * Directly maps and returns only the 5 permitted attributes.
   */
  public static createFromAllowlist(params: {
    itemCategory: string;
    size?: string | null;
    quantity?: string | null;
    dueAt?: Date | string | null;
    preferredBrand?: string | null;
  }): CommerceRecommendationRequest {
    const itemCategory = typeof params.itemCategory === 'string' && params.itemCategory.trim()
      ? params.itemCategory.trim()
      : '其他';

    const size = typeof params.size === 'string' && params.size.trim()
      ? params.size.trim().toUpperCase()
      : null;

    const quantity = typeof params.quantity === 'string' && params.quantity.trim()
      ? params.quantity.trim()
      : null;

    let dueAt: Date | null = null;
    if (params.dueAt) {
      const d = params.dueAt instanceof Date ? params.dueAt : new Date(params.dueAt);
      if (!isNaN(d.getTime())) {
        dueAt = d;
      }
    }

    const preferredBrand = typeof params.preferredBrand === 'string' && params.preferredBrand.trim()
      ? params.preferredBrand.trim()
      : null;

    return Object.freeze({
      itemCategory,
      size,
      quantity,
      dueAt,
      dueDate: dueAt,
      preferredBrand,
    });
  }

  /**
   * Rejects any payload that contains non-allowlist keys (e.g. passing an entire SupplyTask or PII).
   */
  public static assertAllowlistOnly(rawInput: Record<string, any>): void {
    if (!rawInput || typeof rawInput !== 'object') {
      throw new Error('Commerce privacy violation: request payload must be an object.');
    }

    const keys = Object.keys(rawInput);
    for (const key of keys) {
      if (!CommerceDataMinimizer.ALLOWLIST_KEYS.has(key)) {
        throw new Error(
          `Commerce privacy invariant violation: key "${key}" is not permitted. Passing entire database entities (e.g., SupplyTask) or non-allowlisted properties to commerce layer is strictly prohibited. Commerce layer can only receive: itemCategory, size, quantity, dueAt, preferredBrand.`,
        );
      }
    }
  }

  /**
   * Validates allowlist conformity and returns a safe CommerceRecommendationRequest.
   */
  public static minimize(rawInput: Record<string, any>): CommerceRecommendationRequest {
    // Assert strictly that no unexpected keys were provided
    CommerceDataMinimizer.assertAllowlistOnly(rawInput);

    return CommerceDataMinimizer.createFromAllowlist({
      itemCategory: rawInput.itemCategory,
      size: rawInput.size,
      quantity: rawInput.quantity,
      dueAt: rawInput.dueAt || rawInput.dueDate,
      preferredBrand: rawInput.preferredBrand,
    });
  }
}
