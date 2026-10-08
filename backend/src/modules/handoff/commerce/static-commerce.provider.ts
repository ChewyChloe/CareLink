import { Injectable } from '@nestjs/common';
import {
  CommerceProduct,
  CommerceProvider,
  CommerceRecommendationRequest,
  CommerceRecommendationResult,
  RecommendedOption,
} from './commerce-product.interface';
import { CommerceDataMinimizer } from './data-minimizer';

export const STATIC_PRODUCT_CATALOG: CommerceProduct[] = [
  // ── 尿布 (Diapers) ──
  {
    id: 'prod-diaper-moony-m-1',
    itemCategory: '尿布',
    brand: '滿意寶寶',
    productName: '滿意寶寶 瞬潔乾爽 黏貼型 紙尿褲',
    size: 'M',
    packQuantity: 62,
    price: 399,
    unitPrice: 6.4,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物',
    url: 'https://24h.pchome.com.tw/prod/DAAO-MOONY-M',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-diaper-pampers-m-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '幫寶適 一級幫 日本進口 透氣紙尿褲',
    size: 'M',
    packQuantity: 64,
    price: 569,
    unitPrice: 8.9,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pampers-ichiban-m',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-diaper-merries-m-1',
    itemCategory: '尿布',
    brand: '妙而舒',
    productName: '妙而舒 瞬吸舒爽 透氣黏貼型',
    size: 'M',
    packQuantity: 60,
    price: 349,
    unitPrice: 5.8,
    unitPriceUnit: '片',
    estimatedDelivery: '3-5 天送達',
    deliveryHours: 72,
    merchant: '蝦皮直送 嬰幼館',
    url: 'https://shopee.tw/merries-diaper-m-pack',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-diaper-moony-l-1',
    itemCategory: '尿布',
    brand: '滿意寶寶',
    productName: '滿意寶寶 瞬潔乾爽 黏貼型 紙尿褲',
    size: 'L',
    packQuantity: 52,
    price: 399,
    unitPrice: 7.7,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物',
    url: 'https://24h.pchome.com.tw/prod/DAAO-MOONY-L',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-diaper-pampers-l-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '幫寶適 一級幫 透氣拉拉褲',
    size: 'L',
    packQuantity: 46,
    price: 499,
    unitPrice: 10.8,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pampers-pants-l',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-diaper-pampers-nb-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '幫寶適 一級幫 新生兒初生型',
    size: 'NB',
    packQuantity: 66,
    price: 450,
    unitPrice: 6.8,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pampers-nb',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-diaper-pampers-s-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '幫寶適 一級幫 S號透氣紙尿褲',
    size: 'S',
    packQuantity: 60,
    price: 480,
    unitPrice: 8.0,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pampers-s',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },

  // ── 濕紙巾 (Wipes) ──
  {
    id: 'prod-wipes-moony-1',
    itemCategory: '濕紙巾',
    brand: '滿意寶寶',
    productName: '滿意寶寶 純水99% 厚型嬰兒濕紙巾',
    size: null,
    packQuantity: 3,
    price: 139,
    unitPrice: 0.58,
    unitPriceUnit: '抽',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=moony-wipes-3pk',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-wipes-pigeon-1',
    itemCategory: '濕紙巾',
    brand: '貝親',
    productName: '貝親 嬰兒純水濕巾 厚手型 80抽x6包',
    size: null,
    packQuantity: 6,
    price: 320,
    unitPrice: 0.67,
    unitPriceUnit: '抽',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物',
    url: 'https://24h.pchome.com.tw/prod/PIGEON-WIPES-6PK',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-wipes-tainong-1',
    itemCategory: '濕紙巾',
    brand: '台農',
    productName: '台農 純水柔濕巾 80抽x12包 箱購',
    size: null,
    packQuantity: 12,
    price: 380,
    unitPrice: 0.4,
    unitPriceUnit: '抽',
    estimatedDelivery: '3-5 天送達',
    deliveryHours: 72,
    merchant: '蝦皮直送 嬰幼館',
    url: 'https://shopee.tw/tainong-wipes-case',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },

  // ── 奶粉 (Formula) ──
  {
    id: 'prod-formula-nan-1',
    itemCategory: '奶粉',
    brand: '雀巢能恩',
    productName: '雀巢 能恩 幼兒配方奶粉 3號 (800g)',
    size: null,
    packQuantity: 1,
    price: 750,
    unitPrice: 0.94,
    unitPriceUnit: 'g',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: '大樹健康網',
    url: 'https://shop.greattree.com.tw/nan3-800g',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-formula-illuma-1',
    itemCategory: '奶粉',
    brand: '啟賦',
    productName: '惠氏 啟賦 幼兒高階配方奶粉 3號 (850g)',
    size: null,
    packQuantity: 1,
    price: 1480,
    unitPrice: 1.74,
    unitPriceUnit: 'g',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: '丁丁連鎖藥妝',
    url: 'https://www.norbelbaby.com.tw/illuma3-850g',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-formula-enfamil-1',
    itemCategory: '奶粉',
    brand: '美強生',
    productName: '美強生 優兒 A+ 幼兒成長配方 (900g)',
    size: null,
    packQuantity: 1,
    price: 820,
    unitPrice: 0.91,
    unitPriceUnit: 'g',
    estimatedDelivery: '3-4 天送達',
    deliveryHours: 48,
    merchant: '佑全保健藥妝',
    url: 'https://www.yourchance.com.tw/enfamil-900g',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },

  // ── 換洗衣物 (Clothes) ──
  {
    id: 'prod-clothes-lativ-1',
    itemCategory: '換洗衣物',
    brand: 'Lativ',
    productName: '嬰幼兒 純棉短袖包屁衣 3件組',
    size: null,
    packQuantity: 3,
    price: 299,
    unitPrice: 99.7,
    unitPriceUnit: '件',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'Lativ 台灣官網',
    url: 'https://www.lativ.com.tw/baby-cotton-bodysuit',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-clothes-les-1',
    itemCategory: '換洗衣物',
    brand: '麗嬰房',
    productName: '麗嬰房 有機棉親膚長袖紗布衣 2件組',
    size: null,
    packQuantity: 2,
    price: 420,
    unitPrice: 210.0,
    unitPriceUnit: '件',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=les-enphants-gauze',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },

  // ── 其他 (Other) ──
  {
    id: 'prod-other-sponge-1',
    itemCategory: '其他',
    brand: '小獅王辛巴',
    productName: '小獅王辛巴 嬰兒口腔清潔棉棒 30入',
    size: null,
    packQuantity: 30,
    price: 120,
    unitPrice: 4.0,
    unitPriceUnit: '支',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物',
    url: 'https://24h.pchome.com.tw/prod/SIMBA-ORAL-CLEAN',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'prod-other-bib-1',
    itemCategory: '其他',
    brand: '貝親',
    productName: '貝親 拋棄式立體防漏圍兜 20入',
    size: null,
    packQuantity: 20,
    price: 190,
    unitPrice: 9.5,
    unitPriceUnit: '入',
    estimatedDelivery: '24h 到貨',
    deliveryHours: 24,
    merchant: 'MOMO 購物網',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pigeon-bib-20',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
  },
];

@Injectable()
export class StaticCommerceProvider implements CommerceProvider {
  private readonly catalog: CommerceProduct[] = STATIC_PRODUCT_CATALOG;

  async getProductsByCategory(category: string): Promise<CommerceProduct[]> {
    return this.catalog.filter((p) => p.itemCategory === category);
  }

  /**
   * Generates deterministic commerce recommendations.
   * Logic is strictly algorithmic, NOT decided by LLMs.
   */
  async getRecommendations(
    rawRequest: CommerceRecommendationRequest,
  ): Promise<CommerceRecommendationResult> {
    // 1. Enforce privacy & data minimization
    const req = CommerceDataMinimizer.minimize(rawRequest);

    // 2. Candidate pool by category
    let pool = this.catalog.filter((p) => p.itemCategory === req.itemCategory);
    if (pool.length === 0) {
      // Fallback to all catalog if category unknown
      pool = [...this.catalog];
    }

    // 3. Filter by size if specified
    if (req.size) {
      const sizeMatched = pool.filter((p) => p.size === req.size);
      if (sizeMatched.length > 0) {
        pool = sizeMatched;
      }
    }

    // Determine temporal urgency relative to now
    const now = new Date();
    let hoursUntilDue: number | null = null;
    if (req.dueDate) {
      hoursUntilDue = (req.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    }
    const isUrgent = hoursUntilDue !== null && hoursUntilDue <= 36; // <= 1.5 days (tomorrow/today)
    const isRelaxed = hoursUntilDue !== null && hoursUntilDue > 72; // > 3 days (next week)

    // Option A: FASTEST
    const fastestPool = [...pool].sort((a, b) => a.deliveryHours - b.deliveryHours || a.unitPrice - b.unitPrice);
    const fastestProduct = fastestPool[0];
    const fastestReason = isUrgent
      ? '最快到貨：明天前需要補充，因此優先推薦可最快到貨商品。'
      : `最快到貨：預計 ${fastestProduct.estimatedDelivery}，物流最迅速。`;

    // Option B: CHEAPEST_UNIT_PRICE
    const cheapestPool = [...pool].sort((a, b) => a.unitPrice - b.unitPrice || a.deliveryHours - b.deliveryHours);
    const cheapestProduct = cheapestPool[0];
    const cheapestReason = `最省單價：每${cheapestProduct.unitPriceUnit} NT$${cheapestProduct.unitPrice}，目前三個方案最低。`;

    // Option C: PREFERRED_BRAND
    let preferredProduct: CommerceProduct;
    let preferredReason = '';

    if (req.preferredBrand) {
      const brandMatches = pool.filter((p) =>
        p.brand.toLowerCase().includes(req.preferredBrand!.toLowerCase()),
      );
      if (brandMatches.length > 0) {
        preferredProduct = brandMatches.sort((a, b) => a.unitPrice - b.unitPrice)[0];
        preferredReason = `偏好品牌：符合指定偏好品牌【${preferredProduct.brand}】，品質信賴。`;
      } else {
        // Fallback to top rated brand in pool
        preferredProduct = pool.find((p) => p.id !== fastestProduct.id && p.id !== cheapestProduct.id) || pool[0];
        preferredReason = `偏好品牌：家長首選推薦品牌【${preferredProduct.brand}】，好評熱銷。`;
      }
    } else {
      // Brand is chosen from diverse selection distinct from A/B if possible
      const alternate = pool.find((p) => p.id !== fastestProduct.id && p.id !== cheapestProduct.id);
      preferredProduct = alternate || pool[pool.length - 1];
      preferredReason = `偏好品牌：家長首選推薦品牌【${preferredProduct.brand}】，品質口碑保證。`;
    }

    // Assemble options
    const optionFastest: RecommendedOption = {
      type: 'FASTEST',
      title: '最快到貨',
      badge: '最快到貨',
      reason: fastestReason,
      product: fastestProduct,
    };

    const optionCheapest: RecommendedOption = {
      type: 'CHEAPEST_UNIT_PRICE',
      title: '最低單片價格',
      badge: '最低單片價格',
      reason: cheapestReason,
      product: cheapestProduct,
    };

    const optionBrand: RecommendedOption = {
      type: 'PREFERRED_BRAND',
      title: '偏好品牌',
      badge: '偏好品牌',
      reason: preferredReason,
      product: preferredProduct,
    };

    // Ranking priority:
    // If due <= 1 day: FASTEST first
    // If due > 3 days: CHEAPEST_UNIT_PRICE first
    // If preferredBrand specified: PREFERRED_BRAND first
    let orderedOptions: RecommendedOption[];
    if (req.preferredBrand) {
      orderedOptions = [optionBrand, optionFastest, optionCheapest];
    } else if (isUrgent) {
      orderedOptions = [optionFastest, optionCheapest, optionBrand];
    } else if (isRelaxed) {
      orderedOptions = [optionCheapest, optionFastest, optionBrand];
    } else {
      orderedOptions = [optionFastest, optionCheapest, optionBrand];
    }

    return {
      itemCategory: req.itemCategory,
      size: req.size || null,
      options: orderedOptions,
      disclaimer: '價格與優惠以商家頁面當下資訊為準',
    };
  }
}
