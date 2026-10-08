import { MockCareExtractionProvider } from './provider/mock-care-extraction.provider';
import {
  CareExtractionOutputSchema,
  AllowedSupplyCategories,
} from './schemas/care-extraction.schema';

describe('AI Supply Need Extraction Specification', () => {
  let provider: MockCareExtractionProvider;

  beforeAll(() => {
    provider = new MockCareExtractionProvider();
  });

  describe('1. Zod Schema Validation for Supply Needs', () => {
    it('should validate complete supply need payload', () => {
      const output = {
        schema_version: 'v1',
        requires_user_input: false,
        events: [],
        supply_needs: [
          {
            item_name: '尿布',
            size: 'M',
            quantity: '1包',
            remaining_quantity: '5片',
            due_at: '2026-10-09T09:00:00.000Z',
            urgency: 'NORMAL',
            temporal_status: 'PLANNED',
            missing_fields: [],
            confidence: 0.95,
            source_span: '尿布剩5片，明天記得補M號一包',
          },
        ],
      };

      const parsed = CareExtractionOutputSchema.safeParse(output);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.supply_needs?.[0].item_name).toBe('尿布');
        expect(parsed.data.supply_needs?.[0].size).toBe('M');
        expect(parsed.data.supply_needs?.[0].quantity).toBe('1包');
        expect(parsed.data.supply_needs?.[0].remaining_quantity).toBe('5片');
      }
    });

    it('should reject unapproved item categories not in domain enum', () => {
      const invalidCategory = {
        schema_version: 'v1',
        requires_user_input: false,
        events: [],
        supply_needs: [
          {
            item_name: 'iPhone 16 Pro', // Not allowed category
            size: null,
            quantity: '1台',
            remaining_quantity: null,
            due_at: null,
            urgency: 'NORMAL',
            temporal_status: 'PLANNED',
            missing_fields: [],
            confidence: 0.9,
            source_span: '買一台手機',
          },
        ],
      };

      const parsed = CareExtractionOutputSchema.safeParse(invalidCategory);
      expect(parsed.success).toBe(false);
    });

    it('should allow only authorized supply categories', () => {
      expect(AllowedSupplyCategories).toEqual(['尿布', '濕紙巾', '奶粉', '換洗衣物', '其他']);
    });
  });

  describe('2. Golden Path Natural-Language Extraction Test Cases', () => {
    it('Case 1: 「尿布剩5片，明天記得補M號一包」 -> diaper / M / 1 pack / tomorrow', async () => {
      const text = '尿布剩5片，明天記得補M號一包';
      const result = await provider.extract({
        sanitizedText: text,
        availableChildrenTokens: ['CHILD_A'],
        referenceDate: '2026-10-08',
        messageSentAt: new Date(),
      });

      expect(result.output.supply_needs).toBeDefined();
      expect(result.output.supply_needs?.length).toBeGreaterThanOrEqual(1);

      const need = result.output.supply_needs![0];
      expect(need.item_name).toBe('尿布');
      expect(need.size).toBe('M');
      expect(need.quantity).toBe('1包');
      expect(need.remaining_quantity).toBe('5片');
      expect(need.due_at).toBeTruthy();
      expect(need.temporal_status).toBe('PLANNED');
    });

    it('Case 2: 「尿布快沒了」 -> missing due date', async () => {
      const text = '尿布快沒了';
      const result = await provider.extract({
        sanitizedText: text,
        availableChildrenTokens: ['CHILD_A'],
        referenceDate: '2026-10-08',
        messageSentAt: new Date(),
      });

      expect(result.output.supply_needs).toBeDefined();
      expect(result.output.supply_needs?.length).toBeGreaterThanOrEqual(1);

      const need = result.output.supply_needs![0];
      expect(need.item_name).toBe('尿布');
      expect(need.missing_fields).toContain('due_at');
      expect(need.due_at).toBeNull();
    });

    it('Case 3: 「可能要帶尿布」 -> uncertain / requires confirmation', async () => {
      const text = '可能要帶尿布';
      const result = await provider.extract({
        sanitizedText: text,
        availableChildrenTokens: ['CHILD_A'],
        referenceDate: '2026-10-08',
        messageSentAt: new Date(),
      });

      expect(result.output.supply_needs).toBeDefined();
      expect(result.output.supply_needs?.length).toBeGreaterThanOrEqual(1);

      const need = result.output.supply_needs![0];
      expect(need.item_name).toBe('尿布');
      expect(need.temporal_status).toBe('UNCERTAIN');
    });

    it('Case 4: 「不用帶尿布」 -> negated / no SupplyTask', async () => {
      const text = '不用帶尿布';
      const result = await provider.extract({
        sanitizedText: text,
        availableChildrenTokens: ['CHILD_A'],
        referenceDate: '2026-10-08',
        messageSentAt: new Date(),
      });

      expect(result.output.supply_needs).toBeDefined();
      expect(result.output.supply_needs?.length).toBeGreaterThanOrEqual(1);

      const need = result.output.supply_needs![0];
      expect(need.item_name).toBe('尿布');
      expect(need.temporal_status).toBe('NEGATED');
    });

    it('Case 5: 「喝150ml，尿布剩5片」 -> care event + supply need simultaneously', async () => {
      const text = '喝150ml，尿布剩5片';
      const result = await provider.extract({
        sanitizedText: text,
        availableChildrenTokens: ['CHILD_A'],
        referenceDate: '2026-10-08',
        messageSentAt: new Date(),
      });

      // Must have care event
      expect(result.output.events.length).toBeGreaterThanOrEqual(1);
      const feedEvent = result.output.events.find((e) => e.event_type === 'FEED');
      expect(feedEvent).toBeDefined();
      expect(feedEvent?.payload.amount).toBe(150);

      // Must simultaneously have supply need
      expect(result.output.supply_needs).toBeDefined();
      expect(result.output.supply_needs?.length).toBeGreaterThanOrEqual(1);
      const supply = result.output.supply_needs?.find((s) => s.item_name === '尿布');
      expect(supply).toBeDefined();
      expect(supply?.remaining_quantity).toBe('5片');
    });

    it('Golden Path: 「小米今天11:40喝150ml，尿布只剩5片了，明天記得補M號一包」', async () => {
      const text = '小米今天11:40喝150ml，尿布只剩5片了，明天記得補M號一包';
      const result = await provider.extract({
        sanitizedText: text,
        availableChildrenTokens: ['CHILD_A'],
        referenceDate: '2026-10-08',
        messageSentAt: new Date(),
      });

      // Verify Care Event domain object
      const feedEvent = result.output.events.find((e) => e.event_type === 'FEED');
      expect(feedEvent).toBeDefined();
      expect(feedEvent?.occurred_at).toBe('11:40');
      expect(feedEvent?.payload.amount).toBe(150);

      // Verify Supply Need domain object
      const supply = result.output.supply_needs?.find((s) => s.item_name === '尿布');
      expect(supply).toBeDefined();
      expect(supply?.size).toBe('M');
      expect(supply?.quantity).toBe('1包');
      expect(supply?.remaining_quantity).toBe('5片');
      expect(supply?.due_at).toBeTruthy();
      expect(supply?.temporal_status).toBe('PLANNED');
    });
  });
});
