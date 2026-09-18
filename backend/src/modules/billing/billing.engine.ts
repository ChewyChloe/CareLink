export interface OvertimeCalculationInput {
  scheduledEndTime: string; // e.g. "18:00"
  actualCheckoutTime: string; // e.g. "18:31" or ISO timestamp
  unitMinutes: number; // e.g. 30
  ratePerUnit: number; // e.g. 98
  roundingPolicy?: 'CEIL' | 'FLOOR' | 'ROUND'; // default 'CEIL'
}

export interface OvertimeCalculationResult {
  scheduledEnd: string;
  actualCheckout: string;
  overtimeMinutes: number;
  chargeableUnits: number;
  unitMinutes: number;
  ratePerUnit: number;
  overtimeAmount: number;
  formula: string;
  engine: string;
  aiInvolved: boolean;
}

/**
 * Parses time string (either "HH:mm" or full ISO timestamp in Asia/Taipei) into minutes from midnight.
 */
export function parseTimeToMinutes(timeStr: string): { minutes: number; display: string } {
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    const display = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return { minutes: h * 60 + m, display };
  }

  // Handle ISO string
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  // Convert to Asia/Taipei local time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const display = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { minutes: hour * 60 + minute, display };
}

/**
 * 100% Deterministic Overtime Calculation Engine.
 * AI is strictly NEVER invoked for monetary computation.
 *
 * Mandatory rule:
 * scheduledEnd: 18:00
 * actualCheckout: 18:31
 * overtimeMinutes: 31
 * unitMinutes: 30
 * chargeableUnits: ceil(31 / 30) = 2
 * ratePerUnit: 98
 * overtimeAmount: 2 * 98 = NT$ 196
 */
export function calculateOvertimeFee(input: OvertimeCalculationInput): OvertimeCalculationResult {
  const { scheduledEndTime, actualCheckoutTime, unitMinutes = 30, ratePerUnit = 98, roundingPolicy = 'CEIL' } = input;

  if (unitMinutes <= 0) {
    throw new Error('unitMinutes must be greater than 0');
  }
  if (ratePerUnit < 0) {
    throw new Error('ratePerUnit cannot be negative');
  }

  const end = parseTimeToMinutes(scheduledEndTime);
  const actual = parseTimeToMinutes(actualCheckoutTime);

  const diffMinutes = actual.minutes - end.minutes;
  const overtimeMinutes = Math.max(0, diffMinutes);

  if (overtimeMinutes === 0) {
    return {
      scheduledEnd: end.display,
      actualCheckout: actual.display,
      overtimeMinutes: 0,
      chargeableUnits: 0,
      unitMinutes,
      ratePerUnit,
      overtimeAmount: 0,
      formula: '0 分鐘無逾時 = NT$ 0',
      engine: 'DETERMINISTIC_ENGINE_V1',
      aiInvolved: false,
    };
  }

  let chargeableUnits = 0;
  if (roundingPolicy === 'CEIL') {
    chargeableUnits = Math.ceil(overtimeMinutes / unitMinutes);
  } else if (roundingPolicy === 'FLOOR') {
    chargeableUnits = Math.floor(overtimeMinutes / unitMinutes);
  } else {
    chargeableUnits = Math.round(overtimeMinutes / unitMinutes);
  }

  const overtimeAmount = chargeableUnits * ratePerUnit;
  const formula = `⌈${overtimeMinutes} / ${unitMinutes}⌉ × NT$${ratePerUnit} = ${chargeableUnits} × NT$${ratePerUnit} = NT$${overtimeAmount}`;

  return {
    scheduledEnd: end.display,
    actualCheckout: actual.display,
    overtimeMinutes,
    chargeableUnits,
    unitMinutes,
    ratePerUnit,
    overtimeAmount,
    formula,
    engine: 'DETERMINISTIC_ENGINE_V1',
    aiInvolved: false,
  };
}
