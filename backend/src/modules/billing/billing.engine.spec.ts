import { calculateOvertimeFee, parseTimeToMinutes } from './billing.engine';

describe('Deterministic Billing Engine (Phase B)', () => {
  describe('parseTimeToMinutes', () => {
    it('parses HH:mm format correctly', () => {
      expect(parseTimeToMinutes('18:00')).toEqual({ minutes: 18 * 60, display: '18:00' });
      expect(parseTimeToMinutes('18:31')).toEqual({ minutes: 18 * 60 + 31, display: '18:31' });
      expect(parseTimeToMinutes('08:05')).toEqual({ minutes: 8 * 60 + 5, display: '08:05' });
    });

    it('parses ISO string in Asia/Taipei timezone', () => {
      const parsed = parseTimeToMinutes('2026-09-17T18:31:00+08:00');
      expect(parsed.display).toBe('18:31');
      expect(parsed.minutes).toBe(18 * 60 + 31);
    });
  });

  describe('calculateOvertimeFee (Mandatory Demo Test Case)', () => {
    it('calculates the exact mandatory demo case: 18:00 end, 18:31 checkout -> 31 min, 2 units, NT$196', () => {
      const result = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '18:31',
        unitMinutes: 30,
        ratePerUnit: 98,
        roundingPolicy: 'CEIL',
      });

      expect(result.scheduledEnd).toBe('18:00');
      expect(result.actualCheckout).toBe('18:31');
      expect(result.overtimeMinutes).toBe(31);
      expect(result.chargeableUnits).toBe(2);
      expect(result.unitMinutes).toBe(30);
      expect(result.ratePerUnit).toBe(98);
      expect(result.overtimeAmount).toBe(196);
      expect(result.aiInvolved).toBe(false);
      expect(result.formula).toContain('⌈31 / 30⌉ × NT$98 = 2 × NT$98 = NT$196');
    });

    it('returns 0 when on time or early', () => {
      const onTime = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '18:00',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(onTime.overtimeMinutes).toBe(0);
      expect(onTime.chargeableUnits).toBe(0);
      expect(onTime.overtimeAmount).toBe(0);

      const early = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '17:45',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(early.overtimeMinutes).toBe(0);
      expect(early.overtimeAmount).toBe(0);
    });

    it('handles boundary conditions properly: 1 min, 30 min, 60 min, 61 min', () => {
      // 1 minute late -> ceil(1/30) = 1 unit -> NT$98
      const oneMin = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '18:01',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(oneMin.overtimeMinutes).toBe(1);
      expect(oneMin.chargeableUnits).toBe(1);
      expect(oneMin.overtimeAmount).toBe(98);

      // Exactly 30 minutes late -> ceil(30/30) = 1 unit -> NT$98
      const thirtyMin = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '18:30',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(thirtyMin.overtimeMinutes).toBe(30);
      expect(thirtyMin.chargeableUnits).toBe(1);
      expect(thirtyMin.overtimeAmount).toBe(98);

      // Exactly 60 minutes late -> ceil(60/30) = 2 units -> NT$196
      const sixtyMin = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '19:00',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(sixtyMin.overtimeMinutes).toBe(60);
      expect(sixtyMin.chargeableUnits).toBe(2);
      expect(sixtyMin.overtimeAmount).toBe(196);

      // 59 minutes late -> ceil(59/30) = 2 units -> NT$196
      const fiftyNineMin = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '18:59',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(fiftyNineMin.overtimeMinutes).toBe(59);
      expect(fiftyNineMin.chargeableUnits).toBe(2);
      expect(fiftyNineMin.overtimeAmount).toBe(196);

      // 61 minutes late -> ceil(61/30) = 3 units -> NT$294
      const sixtyOneMin = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '19:01',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(sixtyOneMin.overtimeMinutes).toBe(61);
      expect(sixtyOneMin.chargeableUnits).toBe(3);
      expect(sixtyOneMin.overtimeAmount).toBe(294);
    });

    it('guarantees AI is strictly never involved in money calculation', () => {
      const res = calculateOvertimeFee({
        scheduledEndTime: '18:00',
        actualCheckoutTime: '18:31',
        unitMinutes: 30,
        ratePerUnit: 98,
      });
      expect(res.aiInvolved).toBe(false);
      expect(res.engine).toBe('DETERMINISTIC_ENGINE_V1');
    });
  });
});
