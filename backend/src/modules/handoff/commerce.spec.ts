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
      expect(res.disclaimer).toBe('價格與優惠以商家頁面當下資訊為準');
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

    it('should return at least 3 ranked options when products are available', async () => {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const res = await provider.getRecommendations({
        itemCategory: '尿布',
        size: 'M',
        dueDate: tomorrow,
      });

      expect(res.options.length).toBeGreaterThanOrEqual(3);
    });

    it('should never contain placeholder prices or missing merchants', async () => {
      const res = await provider.getRecommendations({
        itemCategory: '濕紙巾',
      });

      for (const opt of res.options) {
        expect(opt.product.price).toBeGreaterThan(0);
        expect(opt.product.merchant).toBeTruthy();
        expect(opt.product.url).toMatch(/^https?:\/\//);
      }
    });
  });

  describe('2. Data Minimization & Privacy Protection Enforcement', () => {
    it('should strictly throw error when sensitive child health data or PII is passed to commerce layer', () => {
      const payloadsWithForbiddenKeys = [
        { itemCategory: '尿布', child_name: '小米' },
        { itemCategory: '尿布', childId: 'child-secret-uuid' },
        { itemCategory: '尿布', temperature: '38.5°C' },
        { itemCategory: '尿布', health_notes: '腹瀉發燒' },
        { itemCategory: '尿布', feeding_records: '11:40 喝奶 150ml' },
        { itemCategory: '尿布', notes: '老師說今天狀況不好' },
      ];

      for (const payload of payloadsWithForbiddenKeys) {
        expect(() => {
          CommerceDataMinimizer.minimize(payload);
        }).toThrow(/Data minimization violation/);
      }
    });

    it('should cleanly minimize allowed operational parameters without leaking non-commerce fields', () => {
      const cleanOperationalContext = {
        itemCategory: '尿布',
        size: 'M',
        quantity: '1包',
        due_at: '2026-10-10T10:00:00.000Z',
        preferredBrand: '滿意寶寶',
        extraIrrelevantClientField: 'some-random-flag',
      };

      const minimized = CommerceDataMinimizer.minimize(cleanOperationalContext);

      // Verify minimized payload contains allowed fields
      expect(minimized.itemCategory).toBe('尿布');
      expect(minimized.size).toBe('M');
      expect(minimized.quantity).toBe('1包');
      expect(minimized.preferredBrand).toBe('滿意寶寶');
      expect(minimized.dueDate).toBeInstanceOf(Date);

      // Verify extra fields dropped
      const keys = Object.keys(minimized);
      expect(keys).not.toContain('extraIrrelevantClientField');
      expect(keys).not.toContain('child_name');
      expect(keys).not.toContain('temperature');
    });
  });
});
