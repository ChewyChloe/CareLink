import { Injectable } from '@nestjs/common';
import {
  CommerceProduct,
  CommerceProvider,
  CommerceRecommendationRequest,
  CommerceRecommendationResult,
  RecommendedOption,
} from './commerce-product.interface';
import { CommerceDataMinimizer } from './data-minimizer';

/**
 * Static product catalog for competition demo purposes.
 * All entries are explicitly marked as DEMO DATA.
 * Neither prices, delivery times, nor stock levels represent real-time merchant conditions.
 *
 * NOTE: As per competition safety hardening, formula (奶粉) commercial recommendations
 * are SUSPENDED in MVP. Low-risk items (尿布, 濕紙巾, 換洗衣物, 其他) are supported.
 */
export const STATIC_PRODUCT_CATALOG: CommerceProduct[] = [
  // ── 尿布 (Diapers) ──
  {
    id: 'prod-diaper-moony-m-1',
    itemCategory: '尿布',
    brand: '滿意寶寶',
    productName: '【DEMO DATA】滿意寶寶 瞬潔乾爽 黏貼型 紙尿褲',
    size: 'M',
    packQuantity: 62,
    price: 399,
    unitPrice: 6.4,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物 (DEMO)',
    url: 'https://24h.pchome.com.tw/prod/DAAO-MOONY-M',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-pampers-m-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '【DEMO DATA】幫寶適 一級幫 日本進口 透氣紙尿褲',
    size: 'M',
    packQuantity: 64,
    price: 569,
    unitPrice: 8.9,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'MOMO 購物網 (DEMO)',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pampers-ichiban-m',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-merries-m-1',
    itemCategory: '尿布',
    brand: '妙而舒',
    productName: '【DEMO DATA】妙而舒 瞬吸舒爽 透氣黏貼型',
    size: 'M',
    packQuantity: 66,
    price: 439,
    unitPrice: 6.6,
    unitPriceUnit: '片',
    estimatedDelivery: '48h 到貨 (示範預估)',
    deliveryHours: 48,
    merchant: '酷澎 Coupang (DEMO)',
    url: 'https://www.coupang.com.tw/vp/products/merries-m',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-pampers-case-m-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '【DEMO DATA】幫寶適 一級幫 箱購 黏貼型 M (144片)',
    size: 'M',
    packQuantity: 144,
    price: 840,
    unitPrice: 5.8,
    unitPriceUnit: '片',
    estimatedDelivery: '3-4 天送達 (示範預估)',
    deliveryHours: 72,
    merchant: '蝦皮商城 (DEMO)',
    url: 'https://shopee.tw/pampers-box-m',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-moony-l-1',
    itemCategory: '尿布',
    brand: '滿意寶寶',
    productName: '【DEMO DATA】滿意寶寶 極上呵護 黏貼型 L (54片)',
    size: 'L',
    packQuantity: 54,
    price: 499,
    unitPrice: 9.2,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'MOMO 購物網 (DEMO)',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=moony-l',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-pampers-l-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '【DEMO DATA】幫寶適 一級幫 箱購 L (120片)',
    size: 'L',
    packQuantity: 120,
    price: 999,
    unitPrice: 8.3,
    unitPriceUnit: '片',
    estimatedDelivery: '48h 到貨 (示範預估)',
    deliveryHours: 48,
    merchant: 'PChome 24h 購物 (DEMO)',
    url: 'https://24h.pchome.com.tw/prod/pampers-l-box',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-merries-l-1',
    itemCategory: '尿布',
    brand: '妙而舒',
    productName: '【DEMO DATA】妙而舒 頂級舒爽 L (52片)',
    size: 'L',
    packQuantity: 52,
    price: 389,
    unitPrice: 7.4,
    unitPriceUnit: '片',
    estimatedDelivery: '3 天送達 (示範預估)',
    deliveryHours: 72,
    merchant: '家樂福線上購物 (DEMO)',
    url: 'https://online.carrefour.com.tw/merries-l',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-moony-s-1',
    itemCategory: '尿布',
    brand: '滿意寶寶',
    productName: '【DEMO DATA】滿意寶寶 極上呵護 S (60片)',
    size: 'S',
    packQuantity: 60,
    price: 450,
    unitPrice: 7.5,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'MOMO 購物網 (DEMO)',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=moony-s',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-diaper-pampers-nb-1',
    itemCategory: '尿布',
    brand: '幫寶適',
    productName: '【DEMO DATA】幫寶適 一級幫 NB 初生型 (70片)',
    size: 'NB',
    packQuantity: 70,
    price: 499,
    unitPrice: 7.1,
    unitPriceUnit: '片',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物 (DEMO)',
    url: 'https://24h.pchome.com.tw/prod/pampers-nb',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },

  // ── 濕紙巾 (Wipes) ──
  {
    id: 'prod-wipes-moony-1',
    itemCategory: '濕紙巾',
    brand: '滿意寶寶',
    productName: '【DEMO DATA】滿意寶寶 純水99% 厚型嬰兒濕紙巾 (80抽x3包)',
    size: null,
    packQuantity: 3,
    price: 139,
    unitPrice: 0.58,
    unitPriceUnit: '抽',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'MOMO 購物網 (DEMO)',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=moony-wipes-3pk',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-wipes-pigeon-1',
    itemCategory: '濕紙巾',
    brand: '貝親',
    productName: '【DEMO DATA】貝親 嬰兒純水濕巾 厚手型 (80抽x6包)',
    size: null,
    packQuantity: 6,
    price: 320,
    unitPrice: 0.67,
    unitPriceUnit: '抽',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'PChome 24h 購物 (DEMO)',
    url: 'https://24h.pchome.com.tw/prod/PIGEON-WIPES-6PK',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-wipes-tainong-1',
    itemCategory: '濕紙巾',
    brand: '台農',
    productName: '【DEMO DATA】台農 純水柔濕巾 80抽x12包 箱購',
    size: null,
    packQuantity: 12,
    price: 380,
    unitPrice: 0.4,
    unitPriceUnit: '抽',
    estimatedDelivery: '3-5 天送達 (示範預估)',
    deliveryHours: 72,
    merchant: '蝦皮直送 嬰幼館 (DEMO)',
    url: 'https://shopee.tw/tainong-wipes-case',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },

  // ── 換洗衣物 (Clothes) ──
  {
    id: 'prod-clothes-lativ-1',
    itemCategory: '換洗衣物',
    brand: 'Lativ',
    productName: '【DEMO DATA】嬰幼兒 純棉短袖包屁衣 3件組',
    size: null,
    packQuantity: 3,
    price: 299,
    unitPrice: 99.7,
    unitPriceUnit: '件',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'Lativ 台灣官網 (DEMO)',
    url: 'https://www.lativ.com.tw/baby-cotton-bodysuit',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
  {
    id: 'prod-clothes-les-1',
    itemCategory: '換洗衣物',
    brand: '麗嬰房',
    productName: '【DEMO DATA】麗嬰房 有機棉親膚長袖紗布衣 2件組',
    size: null,
    packQuantity: 2,
    price: 420,
    unitPrice: 210,
    unitPriceUnit: '件',
    estimatedDelivery: '48h 到貨 (示範預估)',
    deliveryHours: 48,
    merchant: '麗嬰房 官方線上旗艦 (DEMO)',
    url: 'https://www.lesenphants.com.tw/products/organic-gauze-2pk',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },

  // ── 其他 (Others) ──
  {
    id: 'prod-other-bib-1',
    itemCategory: '其他',
    brand: '貝親',
    productName: '【DEMO DATA】貝親 拋棄式嬰兒防溢圍兜 (20入)',
    size: null,
    packQuantity: 20,
    price: 199,
    unitPrice: 9.9,
    unitPriceUnit: '入',
    estimatedDelivery: '24h 到貨 (示範預估)',
    deliveryHours: 24,
    merchant: 'MOMO 購物網 (DEMO)',
    url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=pigeon-bib-20',
    lastUpdatedAt: '2026-10-08T00:00:00.000Z',
    isDemoData: true,
  },
];

@Injectable()
export class StaticCommerceProvider implements CommerceProvider {
  private readonly catalog: CommerceProduct[] = STATIC_PRODUCT_CATALOG;

  async getProductsByCategory(category: string): Promise<CommerceProduct[]> {
    if (category === '奶粉') return [];
    return this.catalog.filter((p) => p.itemCategory === category);
  }

  /**
   * Generates deterministic commerce recommendations.
   * Logic is strictly algorithmic, NOT decided by LLMs.
   *
   * Competition Hardening:
   * 1. 奶粉 (Formula) is strictly suspended from commerce ranking/recommendations in MVP.
   * 2. All items are clearly flagged with DEMO DATA disclaimers.
   * 3. Uses pure allowlist request (itemCategory, size, quantity, dueAt, preferredBrand).
   */
  async getRecommendations(
    rawRequest: CommerceRecommendationRequest,
  ): Promise<CommerceRecommendationResult> {
    // 1. Enforce privacy & data minimization allowlist
    const req = CommerceDataMinimizer.minimize(rawRequest);

    // 2. Safety Rule: Suspend formula (奶粉) commercial recommendation in MVP
    if (req.itemCategory === '奶粉') {
      return {
        itemCategory: '奶粉',
        size: null,
        options: [],
        disclaimer:
          '【DEMO DATA 示範資料】依據嬰幼兒安全規範，競賽 MVP 暫停配方奶粉之商業比價與品牌推薦。奶粉補貨仍可正常設定用品提醒，建議家長依醫療專業指引或常規慣用配方選購。實際價格與優惠以商家頁面為準。',
      };
    }

    // 3. Candidate pool by category
    let pool = this.catalog.filter((p) => p.itemCategory === req.itemCategory);
    if (pool.length === 0) {
      // Fallback to non-formula catalog if category unknown
      pool = this.catalog.filter((p) => p.itemCategory !== '奶粉');
    }

    // 4. Filter by size if specified
    if (req.size) {
      const sizeMatched = pool.filter((p) => p.size === req.size);
      if (sizeMatched.length > 0) {
        pool = sizeMatched;
      }
    }

    // Determine temporal urgency relative to now
    const now = new Date();
    let hoursUntilDue: number | null = null;
    const dueTime = req.dueAt || req.dueDate;
    if (dueTime) {
      hoursUntilDue = (dueTime.getTime() - now.getTime()) / (1000 * 60 * 60);
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
      disclaimer:
        '【DEMO DATA 示範資料】價格、庫存與配送時間僅供競賽功能展示，非即時商業資訊，資料更新時間：2026-10-08。實際價格與優惠以商家頁面為準。',
    };
  }
}
