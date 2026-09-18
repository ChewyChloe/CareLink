import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

export const TemperaturePayloadSchema = z.object({
  value_celsius: z
    .number({ required_error: 'value_celsius is required and must be a number' })
    .finite('value_celsius must be a finite number')
    .min(25.0, 'value_celsius must be >= 25.0°C (broad technical sanity bound)')
    .max(50.0, 'value_celsius must be <= 50.0°C (broad technical sanity bound)'),
  measurement_site: z.string().optional(),
  note: z.string().optional(),
});

export const FeedPayloadSchema = z
  .object({
    milk_type: z.enum(['FORMULA', 'BREAST_MILK', 'OTHER']).default('FORMULA'),
    amount: z.number().positive().optional(),
    amount_ml: z.number().positive().optional(),
    unit: z.string().default('ml'),
    note: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.amount !== undefined && data.amount > 0) ||
      (data.amount_ml !== undefined && data.amount_ml > 0),
    {
      message: 'amount must be a positive number',
    },
  )
  .transform((data) => {
    const amt = data.amount !== undefined ? data.amount : data.amount_ml!;
    return {
      ...data,
      amount: amt,
      amount_ml: amt,
      milk_type: data.milk_type || 'FORMULA',
    };
  });

export const MealPayloadSchema = z.object({
  meal_type: z.string().min(1, 'meal_type is required (e.g. 午餐, 點心, 早餐)'),
  description: z.string().min(1, 'description is required (e.g. 南瓜粥)'),
  amount: z.number().positive().optional(),
  amount_unit: z.string().optional(),
  completion: z.enum(['FULL', 'PARTIAL', 'REFUSED', 'UNKNOWN'], {
    required_error: 'completion must be FULL, PARTIAL, REFUSED, or UNKNOWN',
  }),
  note: z.string().optional(),
});

export const DiaperPayloadSchema = z.object({
  condition: z.enum(['WET', 'DRY', 'SOILED', 'MIXED'], {
    required_error: 'condition must be WET, DRY, SOILED, or MIXED',
  }),
  note: z.string().optional(),
});

export const BowelMovementPayloadSchema = z.object({
  consistency: z.string().optional(), // e.g. 軟便, 糊便, 條狀, 硬便, 水便
  color: z.string().optional(), // e.g. 金黃, 棕黃, 深褐
  amount: z.string().optional(), // e.g. 多, 中, 少
  note: z.string().optional(),
});

export const MedicationPayloadSchema = z.object({
  medication_name: z.string().min(1, 'medication_name is required'),
  dosage_text: z.string().min(1, 'dosage_text is required (e.g. 5ml, 1包)'),
  administered_at: z.string().min(1, 'administered_at is required'),
  guardian_instruction_reference: z.string().optional(),
  note: z.string().optional(),
});

export const ActivityPayloadSchema = z.object({
  activity_type: z.string().min(1, 'activity_type is required (e.g. 閱讀, 探索, 體能)'),
  title: z.string().min(1, 'title is required (e.g. 繪本共讀)'),
  description: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  note: z.string().optional(),
});

export const HygienePayloadSchema = z.object({
  hygiene_type: z.enum(['BATH', 'CLOTHING_CHANGE', 'HAND_WASH', 'ORAL_CARE', 'OTHER'], {
    required_error: 'hygiene_type must be BATH, CLOTHING_CHANGE, HAND_WASH, ORAL_CARE, or OTHER',
  }),
  note: z.string().optional(),
});

export const GrowthMeasurementPayloadSchema = z.object({
  height_cm: z.number().positive().max(200).optional(),
  weight_kg: z.number().positive().max(100).optional(),
  head_circumference_cm: z.number().positive().max(80).optional(),
  note: z.string().optional(),
}).refine(
  (data) =>
    data.height_cm !== undefined ||
    data.weight_kg !== undefined ||
    data.head_circumference_cm !== undefined,
  {
    message: 'At least one of height_cm, weight_kg, or head_circumference_cm must be provided',
  },
);

export const NotePayloadSchema = z.object({
  note_type: z.enum(['TEACHER_REMARK', 'PARENT_COMMENT'], {
    required_error: 'note_type must be TEACHER_REMARK or PARENT_COMMENT',
  }),
  content: z.string().min(1, 'content cannot be empty'),
});

export const SimplePayloadSchema = z.object({
  note: z.string().optional(),
  pickup_time: z.string().optional(),
  person: z.string().optional(),
}).passthrough();

export const EventPayloadSchemas: Record<string, z.ZodSchema> = {
  TEMPERATURE: TemperaturePayloadSchema,
  FEED: FeedPayloadSchema,
  MEAL: MealPayloadSchema,
  DIAPER: DiaperPayloadSchema,
  BOWEL_MOVEMENT: BowelMovementPayloadSchema,
  MEDICATION: MedicationPayloadSchema,
  ACTIVITY: ActivityPayloadSchema,
  HYGIENE: HygienePayloadSchema,
  GROWTH_MEASUREMENT: GrowthMeasurementPayloadSchema,
  NOTE: NotePayloadSchema,
  SLEEP_START: SimplePayloadSchema,
  SLEEP_END: SimplePayloadSchema,
  CHECK_IN: SimplePayloadSchema,
  CHECK_OUT: SimplePayloadSchema,
  PLANNED_PICKUP: SimplePayloadSchema,
  NIGHT_STAY: SimplePayloadSchema,
};

export const ALL_CARE_EVENT_TYPES = [
  'FEED',
  'SLEEP_START',
  'SLEEP_END',
  'CHECK_IN',
  'CHECK_OUT',
  'PLANNED_PICKUP',
  'MEAL',
  'NIGHT_STAY',
  'TEMPERATURE',
  'DIAPER',
  'BOWEL_MOVEMENT',
  'MEDICATION',
  'ACTIVITY',
  'HYGIENE',
  'GROWTH_MEASUREMENT',
  'NOTE',
] as const;

export type CareEventType = (typeof ALL_CARE_EVENT_TYPES)[number];

/**
 * Validates payload against the discriminated schema for the given event type.
 * Throws BadRequestException on validation failure.
 */
export function validateEventPayload(eventType: string, rawPayload: any): Record<string, any> {
  if (!ALL_CARE_EVENT_TYPES.includes(eventType as CareEventType)) {
    throw new BadRequestException(`Unsupported event_type "${eventType}"`);
  }

  const schema = EventPayloadSchemas[eventType];
  if (!schema) {
    return rawPayload || {};
  }

  const parseResult = schema.safeParse(rawPayload);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new BadRequestException(`Validation failed for ${eventType}: ${errorDetails}`);
  }

  return parseResult.data;
}
