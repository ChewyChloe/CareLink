# CareLink

A LINE-based childcare management system for licensed home-based caregivers (居家托育人員) and the parents who trust them with their kids.

Caregivers in Taiwan spend their days feeding, soothing, and changing diapers. Then they spend their evenings typing up daily logs, calculating fees, and chasing down supply lists on LINE. CareLink puts all of that into one place: a LINE Official Account backed by a web app, so the paperwork happens while the care is happening, not after.

## What it does

**For caregivers**, CareLink captures care events (feedings, naps, diaper changes, temperature checks) through natural-language LINE messages. A caregiver types something like "小明 10:30 喝奶 150ml" and Gemini extracts the structured data. The caregiver reviews a draft, taps confirm, and it's recorded. No forms, no spreadsheets.

**For parents**, there's a daily timeline showing exactly what happened and when. They can read the caregiver's notes, leave feedback, and see a running log of their child's day, all through the LINE Mini App.

**For both sides**, billing is computed from the contract terms and actual attendance, with line-item breakdowns for extended care, holidays, and supplies.

### Core features

- Care event recording via LINE chat, with AI extraction (Gemini) and a draft-confirm workflow
- Daily timeline with timestamped events, caregiver notes, and parent feedback
- Attendance tracking with check-in/check-out and calendar view
- Contract management with versioned rate schedules and fee rules
- Billing engine that calculates monthly settlements from attendance evidence and contract terms
- Supply handoff tracking and low-stock reminders
- Rich menu on the LINE Official Account for quick access to all functions
- Role-based access: guardians, caregivers, and co-parents each see what they should

## Architecture

```
LINE Official Account
  ├── Webhook (postback, text messages)
  └── LINE Mini App (LIFF)
         │
    React + Vite + TailwindCSS
         │
    NestJS (modular monolith)
    ├── modules/line      – webhook handling, signature verification, Flex messages
    ├── modules/ai        – Gemini extraction, prompt management, sanitization
    ├── modules/care      – drafts, events, timeline, reports
    ├── modules/billing   – contract-based fee calculation, settlements
    ├── modules/handoff   – supply tasks, reminders
    ├── modules/auth      – LINE login, sessions, access grants
    ├── modules/contracts – versioned rate schedules
    ├── modules/audit     – provenance tracking
    └── modules/jobs      – background job queue
         │
    Prisma ORM → PostgreSQL (Neon)
```

The backend is a NestJS modular monolith. Each domain (care, billing, contracts, handoff) lives in its own module with its own controller, service, DTOs, and tests. The frontend is a React SPA served as a LINE Mini App through LIFF. The database is PostgreSQL on Neon with Prisma as the ORM.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, LIFF SDK |
| Backend | NestJS 10, TypeScript, Zod |
| Database | PostgreSQL 16, Prisma 5, Neon (serverless) |
| AI | Google Gemini (via @google/genai) |
| Messaging | LINE Messaging API, Flex Messages |
| Auth | LINE Login (LIFF), cookie-based sessions |
| Testing | Jest, ts-jest |

## Getting started

### Prerequisites

- Node.js 18+
- A LINE Official Account with Messaging API enabled
- A LINE Mini App (LIFF) channel
- A PostgreSQL database (local via Docker, or Neon)
- A Gemini API key

### Setup

1. Clone the repo:

```bash
git clone https://github.com/ChewyChloe/CareLink.git
cd CareLink
```

2. Set up the database. For local development:

```bash
npm run docker:db:up
```

Or connect to a Neon project by setting `DATABASE_URL` in your env file.

3. Configure the backend:

```bash
cp backend/.env.example backend/.env
# Fill in your LINE credentials, Gemini API key, and database URL
```

The env file needs these values:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `LINE_CHANNEL_SECRET` | From your LINE Messaging API channel |
| `LINE_CHANNEL_ACCESS_TOKEN` | From your LINE Messaging API channel |
| `LINE_PROVIDER_ID` | Your LINE provider ID |
| `LINE_MINI_APP_CHANNEL_ID` | Your LIFF channel ID |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `SESSION_SECRET` | Any string, 32+ characters |

4. Install dependencies and run migrations:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev

cd ../frontend
npm install
```

5. Configure the frontend:

```bash
cp frontend/.env.example frontend/.env
# Set VITE_LIFF_ID to your LIFF app ID
```

6. Start both servers:

```bash
# From the project root
npm run dev:backend    # starts NestJS on port 3000
npm run dev:frontend   # starts Vite on port 5173
```

For LINE webhook testing, you'll need a tunnel (localtunnel or ngrok) pointing to port 3000.

### Running tests

CareLink maintains a strict separation between offline regression suites and live external benchmarks:

#### 1. Offline / Regression Test Results
Runs deterministic test vectors against schema constraints, state machine transitions, and mock domain providers without external network dependencies:

```bash
cd backend
npm test -- --testPathIgnorePatterns=live-gemini-eval
```

Coverage includes:
- **AI Extraction Contract (37 test cases)**: Multilingual sentences, temporal statuses (`ACTUAL`, `PLANNED`, `NEGATED`, `UNCERTAIN`), prompt injection resistance.
- **Supply Workflow & Safety Invariants (12 test cases)**: Server-side validation rejecting confirmation of `UNCERTAIN`, `NEGATED`, missing fields, or missing `due_at`.
- **Commerce Privacy Boundary (8 test cases)**: Strict allowlist construction (`itemCategory`, `size`, `quantity`, `dueAt`, `preferredBrand`), forbidding full entity pass-through.
- **Handoff & Job Scheduling (18 test cases)**: Lifecycle from `PENDING` → `PACKED` → `RECEIVED`, idempotency, and retry keys.

#### 2. Live Gemini Benchmark Results
Live end-to-end evaluation against Google Gemini (`gemini-3.6-flash`) via `@google/genai`:

```bash
cd backend
npm test -- src/modules/ai/live-gemini-eval.spec.ts
```

*Transparency Notice*: Live network calls require an active `GEMINI_API_KEY`. When using Google Cloud Free Tier quotas (20 requests/day), live benchmarks are subject to daily rate limits. In accordance with competition guidelines, CareLink does not claim live AI benchmark accuracy percentages unless a complete, unthrottled live benchmark run is performed with a dedicated quota key.

## Care-to-Commerce Architecture & Privacy Invariants

CareLink closes the loop between caregiving supply shortages and parent procurement while preserving strict data minimization:

1. **Human Confirmation Gate**: AI extracts supply drafts (`SupplyDraft`). A production `SupplyTask` is created only when a caregiver explicitly confirms all required fields. Drafts marked `UNCERTAIN`, `NEGATED`, or missing critical dates cannot be confirmed.
2. **Allowlist Privacy Construction**: The commerce layer only receives five strictly allowlisted attributes:
   - `itemCategory`
   - `size`
   - `quantity`
   - `dueAt`
   - `preferredBrand`
   Full database entities (e.g. `SupplyTask`, `Child`, `User`), health records, and daily notes are never passed to the commerce layer.
3. **Demo Data Disclosure**: All catalog products in the MVP are static demonstration data (`isDemoData: true`, catalog version: 2026-10-08). Real-time pricing, stock, and delivery times are not claimed; actual prices and promotions are subject to merchant partner checkout pages.
4. **Partner Integration Architecture**: Designed for integration with "authorized partner product feed / commerce API when available". No unverified commercial APIs are claimed.
5. **Infant Formula Safety Policy**: In compliance with infant care safety guidelines, commercial price comparisons and brand rankings for infant formula (奶粉) are suspended in the MVP. Parents can still set supply handoff reminders for formula, but are advised to consult pediatric healthcare recommendations for formula choices. Recommendation algorithms are restricted to low-risk consumables (diapers, wet wipes, clothing).

## Database Migrations

CareLink manages schema evolutions through versioned Prisma migrations:

```bash
cd backend
npx prisma migrate deploy
```

Current migrations:
- `20260303100000_init_core`
- `20260303110000_contracts_and_rates`
- `20260303120000_attendance_evidence`
- `20260303130000_supply_tasks`
- `20261008000000_care_to_commerce_supply_draft` (SupplyDraft gate, allowlist schema, and audit indices)

## Project structure

```
CareLink/
├── backend/
│   ├── prisma/              # Schema and migrations
│   ├── src/
│   │   ├── modules/
│   │   │   ├── ai/          # Gemini extraction and prompts
│   │   │   ├── audit/       # Provenance and audit logs
│   │   │   ├── auth/        # LINE login, sessions
│   │   │   ├── billing/     # Fee calculation engine
│   │   │   ├── care/        # Care events, drafts, timeline
│   │   │   ├── contracts/   # Rate schedules, versioning
│   │   │   ├── handoff/     # Supply tasks and reminders
│   │   │   ├── jobs/        # Background job processing
│   │   │   ├── line/        # Webhook, messaging, Flex cards
│   │   │   └── relationships/ # Caregiver-child relationships
│   │   └── main.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/           # Timeline, Billing, Calendar, etc.
│   │   ├── components/      # Shared UI components
│   │   ├── auth/            # Auth context and LIFF integration
│   │   └── App.tsx          # Router setup
│   └── package.json
├── docker-compose.yml       # Local PostgreSQL
└── package.json             # Root workspace scripts
```

## License

This project was built as a capstone project at National Central University (國立中央大學). Not currently published under an open-source license.
