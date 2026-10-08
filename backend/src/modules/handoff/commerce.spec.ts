import { StaticCommerceProvider } from './commerce/static-commerce.provider';
import { CommerceDataMinimizer } from './commerce/data-minimizer';

describe('Commerce Recommendation & Privacy Specification', () => {
  let provider: StaticCommerceProvider;

  beforeAll(() => {
    provider = new StaticCommerceProvider();
  });

  describe('1. Deterministic Recommendation Logic', () => {
    it('should prioritize FASTEST when due tomorrow (<= 1.5 days)', async () => {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const res = await provider.getRecommendations({
        itemCategory: '尿布',
        size: 'M',
        quantity: '1包',
        dueDate: tomorrow,
      });

      expect(res.options.length).toBeGreaterThanOrEqual(1);
      const topOption = res.options[0];
      expect(topOption.type).toBe('FASTEST');
      expect(topOption.badge).toContain('最快到貨');
      expect(topOption.reason).toContain('最快到貨');
      expect(res.disclaimer).toContain('【DEMO DATA 示範資料】');
      expect(res.disclaimer).toContain('實際價格與優惠以商家頁面為準');
    });

    it('should prioritize CHEAPEST_UNIT_PRICE when due next week (> 3 days)', async () => {
      const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const res = await provider.getRecommendations({
        itemCategory: '尿布',
        size: 'M',
        quantity: '1包',
        dueDate: nextWeek,
      });

      expect(res.options.length).toBeGreaterThanOrEqual(1);
      const topOption = res.options[0];
      expect(topOption.type).toBe('CHEAPEST_UNIT_PRICE');
      expect(topOption.badge).toContain('最低單片價格');
      expect(topOption.reason).toContain('最省單價');
    });

    it('should filter and prioritize PREFERRED_BRAND when specified', async () => {
      const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const res = await provider.getRecommendations({
        itemCategory: '尿布',
        size: 'M',
        quantity: '1包',
        dueDate: nextWeek,
        preferredBrand: '幫寶適',
      });

      expect(res.options.length).toBeGreaterThanOrEqual(1);
      const topOption = res.options[0];
      expect(topOption.product.brand).toBe('幫寶適');
      expect(topOption.badge).toContain('偏好品牌');
      expect(topOption.reason).toContain('偏好品牌');
    });

    it('should return at least 3 ranked options when products are available for low-risk items', async () => {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const res = await provider.getRecommendations({
        itemCategory: '尿布',
        size: 'M',
        dueDate: tomorrow,
      });

      expect(res.options.length).toBeGreaterThanOrEqual(3);
    });

    it('Safety Rule: formula (奶粉) commerce recommendation MUST be suspended in MVP', async () => {
      const res = await provider.getRecommendations({
        itemCategory: '奶粉',
      });

      // Must return 0 options and clear guidance disclaimer
      expect(res.options.length).toBe(0);
      expect(res.disclaimer).toContain('奶粉');
      expect(res.disclaimer).toContain('暫停');
      expect(res.disclaimer).toContain('醫療專業指引');
    });

    it('all static catalog items must be marked as DEMO DATA with valid attributes', async () => {
      const res = await provider.getRecommendations({
        itemCategory: '濕紙巾',
      });

      for (const opt of res.options) {
        expect(opt.product.price).toBeGreaterThan(0);
        expect(opt.product.merchant).toBeTruthy();
        expect(opt.product.url).toMatch(/^https?:\/\//);
        expect(opt.product.isDemoData).toBe(true);
      }
    });
  });

  describe('2. Data Minimization & Privacy Protection Enforcement', () => {
    it('should strictly reject payloads with non-allowlisted keys or full database entities', () => {
      const payloadsWithForbiddenKeys = [
        { itemCategory: '尿布', child_name: '小米' },
        { itemCategory: '尿布', childId: 'child-secret-uuid' },
        { itemCategory: '尿布', temperature: '38.5°C' },
        { itemCategory: '尿布', health_notes: '腹瀉發燒' },
        { itemCategory: '尿布', feeding_records: '11:40 喝奶 150ml' },
        { itemCategory: '尿布', notes: '老師說今天狀況不好' },
        // Passing entire SupplyTask entity must be strictly rejected
        {
          id: 'task-123',
          relationship_id: 'rel-456',
          created_by: 'user-789',
          assigned_to: 'guardian-101',
          item_name: '尿布',
          status: 'PENDING',
        },
      ];

      for (const payload of payloadsWithForbiddenKeys) {
        expect(() => {
          CommerceDataMinimizer.assertAllowlistOnly(payload);
        }).toThrow(/Commerce privacy invariant violation/);
      }
    });

    it('should construct recommendation request via pure allowlist without taking entire database entities', () => {
      const allowlistParams = {
        itemCategory: '尿布',
        size: 'M',
        quantity: '1包',
        dueAt: new Date('2026-10-10T10:00:00.000Z'),
        preferredBrand: '滿意寶寶',
      };

      const request = CommerceDataMinimizer.createFromAllowlist(allowlistParams);

      expect(request.itemCategory).toBe('尿布');
      expect(request.size).toBe('M');
      expect(request.quantity).toBe('1包');
      expect(request.dueAt).toEqual(new Date('2026-10-10T10:00:00.000Z'));
      expect(request.preferredBrand).toBe('滿意寶寶');

      // Ensure object keys strictly match allowlist
      const allowedKeyNames = new Set([
        'itemCategory',
        'size',
        'quantity',
        'dueAt',
        'dueDate',
        'preferredBrand',
      ]);
      for (const k of Object.keys(request)) {
        expect(allowedKeyNames.has(k)).toBe(true);
      }
    });
  });
});
