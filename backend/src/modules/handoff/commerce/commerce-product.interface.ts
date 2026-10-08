export interface CommerceProduct {
  id: string;
  itemCategory: string; // '尿布' | '濕紙巾' | '奶粉' | '換洗衣物' | '其他'
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
}

export interface CommerceRecommendationRequest {
  itemCategory: string;
  size?: string | null;
  quantity?: string | null;
  dueDate?: Date | null;
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
  getRecommendations(request: CommerceRecommendationRequest): Promise<CommerceRecommendationResult>;
  getProductsByCategory(category: string): Promise<CommerceProduct[]>;
}
