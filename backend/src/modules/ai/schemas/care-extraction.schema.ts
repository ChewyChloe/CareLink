import { z } from 'zod';

/**
 * Domain-allowed care event types according to CareLink specification.
 * AI models are strictly forbidden from creating arbitrary event types.
 */
export const AllowedEventTypes = [
  'FEED',
  'SLEEP_START',
  'SLEEP_END',
  'CHECK_IN',
  'CHECK_OUT',
  'PLANNED_PICKUP',
  'MEAL',
  'NIGHT_STAY',
] as const;

export type AllowedEventType = (typeof AllowedEventTypes)[number];

/**
 * Temporal status of the event.
 * Only ACTUAL events are eligible for official care records upon human confirmation.
 */
export const TemporalStatuses = [
  'ACTUAL',
  'PLANNED',
  'NEGATED',
  'UNCERTAIN',
] as const;

export type TemporalStatus = (typeof TemporalStatuses)[number];

/**
 * Zod schema for structured payloads based on event type.
 */
export const FeedPayloadSchema = z.object({
  amount: z.number().nonnegative('Amount cannot be negative').optional(),
  amount_unit: z.enum(['ml', 'oz', 'cc', 'g', '瓶', '碗']).optional(),
  feed_type: z.enum(['BREAST_MILK', 'FORMULA', 'WATER', 'MEDICINE', 'OTHER']).optional(),
  notes: z.string().max(500).optional(),
}).passthrough();

export const MealPayloadSchema = z.object({
  food_type: z.string().max(200).optional(),
  amount: z.union([z.string(), z.number().nonnegative()]).optional(),
  notes: z.string().max(500).optional(),
}).passthrough();

export const PickupPayloadSchema = z.object({
  pickup_person: z.string().max(100).optional(),
  relationship_to_child: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
}).passthrough();

export const GenericPayloadSchema = z.record(z.unknown()).refine((data) => {
  // Disallow any suspicious billing, money, or system privilege fields in payload
  const forbiddenRegex = /(?:^|_)(rate|fee|price|cost|billing|discount|admin|grant|role|sql)(?:_|$)/i;
  const keys = Object.keys(data);
  for (const k of keys) {
    if (forbiddenRegex.test(k)) {
      return false;
    }
  }
  return true;
}, { message: 'Dangerous or billing-related field detected in extraction payload' });

/**
 * Single extracted care event candidate.
 */
export const ExtractedCareEventSchema = z.object({
  event_type: z.enum(AllowedEventTypes),
  occurred_at: z.string().nullable().describe('ISO 8601 string or HH:mm time if date is inferred from context'),
  payload: GenericPayloadSchema.describe('Structured event-specific properties'),
  missing_fields: z.array(z.string()).default([]).describe('List of missing mandatory fields e.g. amount_unit, child, time'),
  source_span: z.string().describe('Exact substring from the original message that justifies this extraction'),
  temporal_status: z.enum(TemporalStatuses).describe('ACTUAL, PLANNED, NEGATED, or UNCERTAIN'),
  child_ref: z.string().nullable().describe('Pseudonymized token e.g. CHILD_A, CHILD_B or null if unknown'),
});

export type ExtractedCareEvent = z.infer<typeof ExtractedCareEventSchema>;

/**
 * Standardized supply item categories.
 * Models are forbidden from inventing arbitrary item categories.
 */
export const AllowedSupplyCategories = [
  '尿布',
  '濕紙巾',
  '奶粉',
  '換洗衣物',
  '其他',
] as const;

export type AllowedSupplyCategory = (typeof AllowedSupplyCategories)[number];

/**
 * Single extracted supply need candidate for human confirmation.
 */
export const ExtractedSupplyNeedSchema = z.object({
  item_name: z.enum(AllowedSupplyCategories).describe('Standardized supply category'),
  size: z.string().nullable().default(null).describe('Size e.g. NB, S, M, L, XL or null'),
  quantity: z.string().nullable().default(null).describe('Requested quantity e.g. 1包, 2罐 or null'),
  remaining_quantity: z.string().nullable().default(null).describe('Remaining quantity e.g. 5片, 剩半罐 or null'),
  due_at: z.string().nullable().default(null).describe('ISO 8601 string or null if unspecified'),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL').describe('Urgency level'),
  missing_fields: z.array(z.string()).default([]).describe('Missing fields such as due_at or quantity'),
  confidence: z.number().min(0).max(1).default(0.9).describe('Confidence score between 0 and 1'),
  source_span: z.string().optional().describe('Original snippet from message'),
  temporal_status: z.enum(TemporalStatuses).default('ACTUAL').describe('ACTUAL, PLANNED, NEGATED, or UNCERTAIN'),
});

export type ExtractedSupplyNeed = z.infer<typeof ExtractedSupplyNeedSchema>;

/**
 * Root structured extraction output schema.
 * Supports both care_events (aliased as events for backward compatibility) and supply_needs.
 */
export const CareExtractionOutputSchema = z.object({
  unsupported: z.array(z.object({ reason: z.literal('requires_manual_entry'), event_type: z.string() })).optional(),
  schema_version: z.string().default('v1'),
  events: z.array(ExtractedCareEventSchema).default([]),
  supply_needs: z.array(ExtractedSupplyNeedSchema).default([]),
  requires_user_input: z.boolean().default(false).describe('True if missing fields, multi-child ambiguity, or uncertainty exists'),
});

export type CareExtractionOutput = z.infer<typeof CareExtractionOutputSchema>;

/**
 * JSON Schema for Gemini Structured Output API (responseSchema)
 */
export const GeminiCareExtractionJsonSchema = {
  type: 'OBJECT',
  properties: {
    schema_version: { type: 'STRING', description: 'Schema version e.g. v1' },
    requires_user_input: { type: 'BOOLEAN', description: 'Set true if facts are missing or uncertain' },
    unsupported: { type: 'ARRAY', items: { type: 'OBJECT', properties: { reason: { type: 'STRING', enum: ['requires_manual_entry'] }, event_type: { type: 'STRING' } }, required: ['reason', 'event_type'] } },
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          event_type: {
            type: 'STRING',
            enum: [...AllowedEventTypes],
            description: 'Care event type',
          },
          occurred_at: {
            type: 'STRING',
            nullable: true,
            description: 'Time or ISO string when event occurred or is planned',
          },
          payload: {
            type: 'OBJECT',
            properties: {
              amount: { type: 'NUMBER', description: 'Numeric amount if explicitly mentioned' },
              amount_unit: { type: 'STRING', description: 'Unit e.g. ml, oz if explicitly mentioned' },
              feed_type: { type: 'STRING', description: 'Type of feed e.g. BREAST_MILK, FORMULA' },
              food_type: { type: 'STRING', description: 'Food item description' },
              pickup_person: { type: 'STRING', description: 'Who is picking up the child' },
              notes: { type: 'STRING', description: 'Supplementary observation' },
            },
          },
          missing_fields: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Missing fields that could not be determined from the message (e.g. amount_unit, child)',
          },
          source_span: {
            type: 'STRING',
            description: 'Original snippet from the user message that this event is derived from',
          },
          temporal_status: {
            type: 'STRING',
            enum: [...TemporalStatuses],
            description: 'ACTUAL, PLANNED, NEGATED, or UNCERTAIN',
          },
          child_ref: {
            type: 'STRING',
            nullable: true,
            description: 'Token reference like CHILD_A or CHILD_B',
          },
        },
        required: ['event_type', 'temporal_status', 'source_span', 'missing_fields', 'occurred_at', 'payload', 'child_ref'],
      },
    },
    supply_needs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          item_name: {
            type: 'STRING',
            enum: [...AllowedSupplyCategories],
            description: 'Supply item category',
          },
          size: { type: 'STRING', nullable: true, description: 'Size e.g. M, L, NB' },
          quantity: { type: 'STRING', nullable: true, description: 'Requested quantity e.g. 1包' },
          remaining_quantity: { type: 'STRING', nullable: true, description: 'Remaining amount e.g. 5片' },
          due_at: { type: 'STRING', nullable: true, description: 'Due date ISO string or null' },
          urgency: { type: 'STRING', enum: ['LOW', 'NORMAL', 'HIGH'], description: 'Urgency' },
          missing_fields: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Missing fields e.g. due_at' },
          confidence: { type: 'NUMBER', description: 'Confidence score' },
          source_span: { type: 'STRING', description: 'Source text' },
          temporal_status: { type: 'STRING', enum: [...TemporalStatuses], description: 'Temporal status' },
        },
        required: ['item_name', 'urgency', 'missing_fields', 'confidence', 'temporal_status'],
      },
    },
  },
  required: ['schema_version', 'requires_user_input', 'events'],
};
