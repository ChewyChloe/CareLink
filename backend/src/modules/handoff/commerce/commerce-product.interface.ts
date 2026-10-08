/**
 * Commerce domain abstractions for CareLink Care-to-Commerce loop.
 *
 * Designed to support future integration with authorized partner product feed
 * / commerce API when available, while providing strict boundary isolation in MVP.
 */

export interface CommerceProduct {
  id: string;
  itemCategory: string; // '尿布' | '濕紙巾' | '換洗衣物' | '其他' (奶粉 suspended in commerce MVP)
  brand: string;
  productName: string;
  size: string | null;
  packQuantity: number;
  price: number;
  unitPrice: number;
  unitPriceUnit: string;
  estimatedDelivery: string;
  deliveryHours: number;
  merchant: string;
  url: string;
  lastUpdatedAt: string;
  isDemoData: boolean;
}

/**
 * Strict allowlist construction payload.
 * Commerce layer MUST only receive these 5 attributes.
 * Full database entities (e.g. SupplyTask, Child, User) must NEVER be passed.
 */
export interface CommerceRecommendationRequest {
  itemCategory: string;
  size?: string | null;
  quantity?: string | null;
  dueAt?: Date | null;
  dueDate?: Date | null; // Compatibility alias for dueAt
  preferredBrand?: string | null;
}

export interface RecommendedOption {
  type: 'FASTEST' | 'CHEAPEST_UNIT_PRICE' | 'PREFERRED_BRAND';
  title: string;
  badge: string;
  reason: string;
  product: CommerceProduct;
}

export interface CommerceRecommendationResult {
  itemCategory: string;
  size: string | null;
  options: RecommendedOption[];
  disclaimer: string;
}

export interface CommerceProvider {
  /**
   * Generates deterministic product recommendations from an allowlist request.
   */
  getRecommendations(request: CommerceRecommendationRequest): Promise<CommerceRecommendationResult>;

  /**
   * Retrieves products by category from authorized partner product feed / commerce API when available.
   */
  getProductsByCategory(category: string): Promise<CommerceProduct[]>;
}
