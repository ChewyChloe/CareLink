import { Injectable } from '@nestjs/common';
import {
  CareExtractionProvider,
  CareExtractionInput,
  CareExtractionResult,
} from './care-extraction-provider.interface';
import {
  CareExtractionOutput,
  CareExtractionOutputSchema,
  ExtractedCareEvent,
  ExtractedSupplyNeed,
  AllowedSupplyCategory,
  AllowedEventType,
  TemporalStatus,
} from '../schemas/care-extraction.schema';
import { CARE_EVENT_EXTRACTION_PROMPT_METADATA } from '../prompts/care-extraction.prompt';

@Injectable()
export class MockCareExtractionProvider implements CareExtractionProvider {
  async extract(input: CareExtractionInput): Promise<CareExtractionResult> {
    const startTime = Date.now();
    const text = input.sanitizedText.trim();
    const events: ExtractedCareEvent[] = [];
    let requiresUserInput = false;

    // 1. Defend against Prompt Injections
    const injectionPatterns = [
      /忽略.*規則/i,
      /費率.*改/i,
      /改.*0元/i,
      /reveal.*data/i,
      /system:/i,
      /drop\s+table/i,
      /grant\s+admin/i,
      /ignore\s+previous/i,
    ];

    if (injectionPatterns.some((pattern) => pattern.test(text))) {
      // Injections are neutralized. Return zero events and do not execute any command.
      return {
        output: {
          schema_version: 'v1',
          events: [],
          supply_needs: [],
          requires_user_input: false,
        },
        promptVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.promptVersion,
        schemaVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.schemaVersion,
        modelId: 'mock-rule-evaluator',
        latencyMs: Date.now() - startTime,
      };
    }

    // 2. Check for garbage / non-care noise (unless it mentions supply items)
    const isSupplyMention = /尿布|紙尿褲|濕紙巾|柔濕巾|奶粉|換洗衣物|衣服/.test(text);
    if (
      /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?\s]+$/.test(text) &&
      !/\d{1,2}[:點]\d{2}/.test(text) &&
      !/ml|cc|oz/i.test(text) &&
      !isSupplyMention
    ) {
      return {
        output: {
          schema_version: 'v1',
          events: [],
          supply_needs: [],
          requires_user_input: false,
        },
        promptVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.promptVersion,
        schemaVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.schemaVersion,
        modelId: 'mock-rule-evaluator',
        latencyMs: Date.now() - startTime,
      };
    }

    // Pure observation sentences without childcare actions or supplies
    if (
      (/今天天氣真好|早安貼圖/i.test(text) || (/沒有發燒/i.test(text) && !/喝|吃|睡|接/i.test(text))) &&
      !isSupplyMention
    ) {
      return {
        output: {
          schema_version: 'v1',
          events: [],
          supply_needs: [],
          requires_user_input: false,
        },
        promptVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.promptVersion,
        schemaVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.schemaVersion,
        modelId: 'mock-rule-evaluator',
        latencyMs: Date.now() - startTime,
      };
    }

    // Determine target child reference
    let targetChildRef: string | null = null;
    if (input.availableChildrenTokens.length === 1) {
      targetChildRef = input.availableChildrenTokens[0];
    } else if (input.availableChildrenTokens.length > 1) {
      for (const token of input.availableChildrenTokens) {
        if (text.includes(token)) {
          targetChildRef = token;
          break;
        }
      }
      if (!targetChildRef && !/哥哥|妹妹|大寶|小寶/.test(text)) {
        // Multi-child ambiguity
        requiresUserInput = true;
      }
    }

    // Helper to determine temporal status
    const detectTemporal = (snippet: string): TemporalStatus => {
      if (/沒有|沒|不|未/i.test(snippet)) return 'NEGATED';
      if (/可能|大概|好像|預估|估計/i.test(snippet)) return 'UNCERTAIN';
      if (/等等|待會|預計|將|晚點|要|會|改由/i.test(snippet)) return 'PLANNED';
      return 'ACTUAL';
    };

    // 3. Multi-event and care event parsing
    const segments = text.split(/[,，;；\n]+/).filter(Boolean);

    for (const seg of segments) {
      const segTrim = seg.trim();
      if (!segTrim) continue;

      let childForSeg = targetChildRef;
      if (input.availableChildrenTokens.length > 1) {
        for (const token of input.availableChildrenTokens) {
          if (segTrim.includes(token)) {
            childForSeg = token;
            break;
          }
        }
        // Specific multi-child keywords
        if (!childForSeg) {
          if (/哥哥|大寶/.test(segTrim)) childForSeg = input.availableChildrenTokens[0];
          if (/妹妹|小寶/.test(segTrim)) childForSeg = input.availableChildrenTokens[1] || input.availableChildrenTokens[0];
        }
      }

      // Time match (e.g. 11:40, 13:10, 15:20, 18:31, 七點, 六點半, 晚上八點)
      const timeMatch = segTrim.match(/(\d{1,2}[:：點]\d{2}|\d{1,2}點半?|[一二三四五六七八九十]+點半?)/);
      const occurredAt = timeMatch
        ? timeMatch[1]
            .replace('：', ':')
            .replace('點', ':00')
            .replace(':00半', ':30')
            .replace('八:00', '20:00')
            .replace('七:00', '19:00')
            .replace('六:30', '18:30')
        : null;

      const temporal = detectTemporal(segTrim);

      // Strip time representation from text so "11:40" is not parsed as amount=11
      const textWithoutTime = segTrim.replace(/(\d{1,2}[:：點]\d{2}|\d{1,2}點半?|[一二三四五六七八九十]+點半?)/g, '');

      // A. Feeding (milk, formula, water, medicine)
      if (/喝|奶|配方|母乳|藥水|150ml|120ml|180ml|200ml/i.test(segTrim)) {
        const amountMatch = textWithoutTime.match(/(\d+)\s*(ml|cc|oz|瓶)?/i);
        const amount = amountMatch ? parseInt(amountMatch[1], 10) : undefined;
        const unit = amountMatch && amountMatch[2] ? amountMatch[2].toLowerCase() : undefined;
        const missing: string[] = [];

        if (amount && !unit) {
          missing.push('amount_unit');
          requiresUserInput = true;
        }
        if (!occurredAt && temporal === 'ACTUAL') {
          missing.push('occurred_at');
        }
        if (!childForSeg && input.availableChildrenTokens.length > 1) {
          missing.push('child');
          requiresUserInput = true;
        }

        events.push({
          event_type: 'FEED',
          occurred_at: occurredAt,
          payload: {
            amount,
            ...(unit ? { amount_unit: unit } : {}),
            feed_type: /母/i.test(segTrim) ? 'BREAST_MILK' : /藥/i.test(segTrim) ? 'MEDICINE' : 'FORMULA',
          },
          missing_fields: missing,
          source_span: segTrim,
          temporal_status: temporal,
          child_ref: childForSeg,
        });
        continue;
      }

      // B. Sleep Start
      if ((/睡著|入睡|睡了|睡覺/i.test(segTrim) || /還沒/i.test(segTrim)) && !/醒/i.test(segTrim)) {
        const missing: string[] = [];
        if (!occurredAt && temporal === 'ACTUAL') missing.push('occurred_at');
        if (!childForSeg && input.availableChildrenTokens.length > 1) {
          missing.push('child');
          requiresUserInput = true;
        }

        events.push({
          event_type: 'SLEEP_START',
          occurred_at: occurredAt,
          payload: {},
          missing_fields: missing,
          source_span: segTrim,
          temporal_status: temporal,
          child_ref: childForSeg,
        });
        continue;
      }

      // C. Sleep End
      if (/醒|起床|醒來/i.test(segTrim)) {
        const missing: string[] = [];
        if (!occurredAt && temporal === 'ACTUAL') missing.push('occurred_at');
        if (!childForSeg && input.availableChildrenTokens.length > 1) {
          missing.push('child');
          requiresUserInput = true;
        }

        events.push({
          event_type: 'SLEEP_END',
          occurred_at: occurredAt,
          payload: {},
          missing_fields: missing,
          source_span: segTrim,
          temporal_status: temporal,
          child_ref: childForSeg,
        });
        continue;
      }

      // D. Check out / Pickup
      if (/接走|接|回家/i.test(segTrim)) {
        const isPlanned = temporal === 'PLANNED' || temporal === 'UNCERTAIN';
        const eventType: AllowedEventType = isPlanned ? 'PLANNED_PICKUP' : 'CHECK_OUT';
        const personMatch = segTrim.match(/(阿嬤|爸爸|媽媽|阿公|姑姑|叔叔|保母)/);
        const missing: string[] = [];
        if (!occurredAt && temporal === 'ACTUAL') missing.push('occurred_at');
        if (!childForSeg && input.availableChildrenTokens.length > 1) {
          missing.push('child');
          requiresUserInput = true;
        }

        events.push({
          event_type: eventType,
          occurred_at: occurredAt,
          payload: {
            ...(personMatch ? { pickup_person: personMatch[1] } : {}),
          },
          missing_fields: missing,
          source_span: segTrim,
          temporal_status: temporal,
          child_ref: childForSeg,
        });
        continue;
      }

      // E. Check In
      if (/送到|抵達|進托|到家/i.test(segTrim)) {
        const missing: string[] = [];
        if (!occurredAt && temporal === 'ACTUAL') missing.push('occurred_at');
        if (!childForSeg && input.availableChildrenTokens.length > 1) {
          missing.push('child');
          requiresUserInput = true;
        }

        events.push({
          event_type: 'CHECK_IN',
          occurred_at: occurredAt,
          payload: {},
          missing_fields: missing,
          source_span: segTrim,
          temporal_status: temporal,
          child_ref: childForSeg,
        });
        continue;
      }

      // F. Meal
      if (/副食品|吃粥|吃麵|吃飯|吃果泥|米餅|吃了/i.test(segTrim)) {
        const missing: string[] = [];
        if (!occurredAt && temporal === 'ACTUAL') missing.push('occurred_at');
        if (!childForSeg && input.availableChildrenTokens.length > 1) {
          missing.push('child');
          requiresUserInput = true;
        }

        events.push({
          event_type: 'MEAL',
          occurred_at: occurredAt,
          payload: { food_type: segTrim },
          missing_fields: missing,
          source_span: segTrim,
          temporal_status: temporal,
          child_ref: childForSeg,
        });
        continue;
      }
    }

    // 4. Extract Supply Needs
    const { supplyNeeds, requiresInput: supplyRequiresInput } = this.extractSupplyNeeds(
      text,
      input.referenceDate,
    );

    if (
      events.some((e) => e.missing_fields.length > 0 || e.temporal_status === 'UNCERTAIN') ||
      supplyRequiresInput ||
      supplyNeeds.some((s) => s.missing_fields.length > 0 || s.temporal_status === 'UNCERTAIN')
    ) {
      requiresUserInput = true;
    }

    const output: CareExtractionOutput = {
      schema_version: 'v1',
      events,
      supply_needs: supplyNeeds,
      requires_user_input: requiresUserInput,
    };

    // Strict runtime Zod schema validation
    const validated = CareExtractionOutputSchema.parse(output);

    return {
      output: validated,
      promptVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.promptVersion,
      schemaVersion: CARE_EVENT_EXTRACTION_PROMPT_METADATA.schemaVersion,
      modelId: 'mock-rule-evaluator',
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Deterministic extraction for childcare supply needs and inventory alerts.
   */
  private extractSupplyNeeds(
    text: string,
    referenceDate: string,
  ): { supplyNeeds: ExtractedSupplyNeed[]; requiresInput: boolean } {
    const supplyNeeds: ExtractedSupplyNeed[] = [];
    let requiresInput = false;

    // Check if message discusses supplies
    const supplyKeywords = ['尿布', '紙尿褲', '濕紙巾', '柔濕巾', '奶粉', '換洗衣物', '衣服', '包屁衣', '紗布衣'];
    const hasSupplyMention = supplyKeywords.some((kw) => text.includes(kw));

    if (!hasSupplyMention) {
      return { supplyNeeds: [], requiresInput: false };
    }

    // Determine category
    let itemName: AllowedSupplyCategory = '其他';
    if (/尿布|紙尿褲/.test(text)) itemName = '尿布';
    else if (/濕紙巾|柔濕巾/.test(text)) itemName = '濕紙巾';
    else if (/奶粉/.test(text)) itemName = '奶粉';
    else if (/換洗衣物|衣物|衣服|包屁衣|紗布衣/.test(text)) itemName = '換洗衣物';

    // Determine temporal status
    let temporalStatus: TemporalStatus = 'ACTUAL';
    let confidence = 0.95;

    if (/不用|不需要|別帶|免帶|不用補/.test(text)) {
      temporalStatus = 'NEGATED';
    } else if (/可能|好像|大概|不確定/.test(text)) {
      temporalStatus = 'UNCERTAIN';
      confidence = 0.6;
      requiresInput = true;
    } else if (/明天|後天|等等|預計|下週/.test(text)) {
      temporalStatus = 'PLANNED';
    }

    // Extract size (e.g. M號, L號, NB, S, XL) - must NOT match "ml" (volume)
    let size: string | null = null;
    const sizeMatch = text.match(/(?<!\d)(NB|XXL|XL|[SML])\s*號/i) || text.match(/(?<!\d)(NB|XXL|XL|[SML])\b(?!l|L)/i);
    if (sizeMatch) {
      size = sizeMatch[1].toUpperCase();
    }

    // Extract quantity (e.g. 1包, 一包, 2罐, 兩罐)
    let quantity: string | null = null;
    const qtyMatch = text.match(/(?:補|帶|買|準備|需要)?\s*([0-9一二兩三四五六七八九十]+)\s*(包|罐|盒|件|條|袋|組)/);
    if (qtyMatch) {
      const numStr = qtyMatch[1]
        .replace('一', '1')
        .replace('兩', '2')
        .replace('二', '2')
        .replace('三', '3')
        .replace('四', '4')
        .replace('五', '5');
      quantity = `${numStr}${qtyMatch[2]}`;
    }

    // Extract remaining quantity (e.g. 剩5片, 只剩5片, 剩約半罐)
    let remainingQuantity: string | null = null;
    const remMatch = text.match(/(?:剩|只剩|剩下|約)\s*([約0-9一二兩三四五六七八九十半]+\s*(?:片|抽|罐|包|件|次)?)/);
    if (remMatch && remMatch[1]) {
      const trimmedRem = remMatch[1].trim();
      if (trimmedRem && !trimmedRem.startsWith('1包') && !trimmedRem.startsWith('一包')) {
        remainingQuantity = trimmedRem;
      }
    }

    // Calculate due_at
    let dueAt: string | null = null;
    const missingFields: string[] = [];

    const baseRef = referenceDate ? new Date(referenceDate) : new Date();
    if (isNaN(baseRef.getTime())) {
      baseRef.setTime(Date.now());
    }

    if (/明天/.test(text)) {
      const tomorrow = new Date(baseRef);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      dueAt = `${y}-${m}-${d}T09:00:00.000Z`;
    } else if (/後天/.test(text)) {
      const afterTomorrow = new Date(baseRef);
      afterTomorrow.setDate(afterTomorrow.getDate() + 2);
      const y = afterTomorrow.getFullYear();
      const m = String(afterTomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(afterTomorrow.getDate()).padStart(2, '0');
      dueAt = `${y}-${m}-${d}T09:00:00.000Z`;
    } else if (/下週/.test(text)) {
      const nextWeek = new Date(baseRef);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const y = nextWeek.getFullYear();
      const m = String(nextWeek.getMonth() + 1).padStart(2, '0');
      const d = String(nextWeek.getDate()).padStart(2, '0');
      dueAt = `${y}-${m}-${d}T09:00:00.000Z`;
    } else if (temporalStatus !== 'NEGATED') {
      // Due date is missing!
      dueAt = null;
      missingFields.push('due_at');
      requiresInput = true;
    }

    // Urgency
    let urgency: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL';
    if (/急|立刻|馬上|底限/.test(text) || (remainingQuantity && /^[1-3]片/.test(remainingQuantity))) {
      urgency = 'HIGH';
    } else if (/慢慢|不急|下個月/.test(text)) {
      urgency = 'LOW';
    }

    supplyNeeds.push({
      item_name: itemName,
      size,
      quantity,
      remaining_quantity: remainingQuantity,
      due_at: dueAt,
      urgency,
      missing_fields: missingFields,
      confidence,
      source_span: text,
      temporal_status: temporalStatus,
    });

    return { supplyNeeds, requiresInput };
  }
}

