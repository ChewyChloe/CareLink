# Architecture Decision Record (ADR) 0001: Temperature Validation Policy

## Context and Problem Statement
In caregiving tracking, child body temperature readings are recorded by caregivers and guardians using various consumer and clinical thermometers (e.g., tympanic ear thermometer, forehead scanner, axillary).
Previously, hard constraints and implicit clinical assumptions (e.g., 34.0°C–43.0°C or automatic labels like "normal / fever / hypothermia") existed without a formalized medical policy.

We must clearly decouple:
1. **Technical parsing validation** (safeguarding the system from invalid data, overflows, instrument glitches, or malformed payloads).
2. **Clinical interpretation** (medical diagnosis, fever categorization, hypothermia triage, or treatment guidance).

CareLink is a deterministic care logging and record-keeping platform, NOT a medical diagnostic device. CareLink should preserve an unusual measured value rather than silently dropping or rejecting an accurate caregiver observation.

## Decision
1. **Separation of Concerns**:
   - `technical validation ≠ clinical interpretation`.
   - Technical validation strictly checks:
     - The input is a finite, numeric value.
     - The reading falls within a broad technical sanity bound: `[25.0°C, 50.0°C]`. Values outside this range represent physical impossibility or instrument transmission failure and are rejected with a clear 400 Bad Request.
2. **Objective Factual Payload**:
   - The persisted CareEvent revision payload stores solely objective factual records:
     - `value_celsius`: number (finite)
     - `measurement_site`: optional string (e.g., 耳溫, 額溫, 腋溫)
     - `note`: optional string
   - No clinical warning flags or `requires_confirmation` booleans are stored inside the factual event payload.
3. **No Automated Clinical Diagnosis**:
   - CareLink strictly avoids assigning automatic diagnostic labels such as "normal", "fever", "mild fever", "high fever", or "hypothermia".
   - Any UI confirmation or attention callouts for unusual numbers must be managed strictly in UI interaction state / request metadata, without mutating or pre-interpreting the objective clinical record.
4. **Preservation of Unusual Readings**:
   - If a caregiver measures 35.1°C or 40.2°C, the system records the exact value confirmed by the human, ensuring legal and historical integrity of the record.

## Consequences
- The database and API schemas remain clean, deterministic, and medically defensible.
- CareLink cannot be held liable for misdiagnosing or failing to diagnose medical emergencies.
- Caregivers and healthcare providers receive unadulterated, trustworthy records.
