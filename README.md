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

```bash
cd backend
npm test
```

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

## Competition core-flow hardening
See [demo runbook](docs/competition-demo-runbook.md) for permanent HTTPS deployment, LINE Console webhook, LIFF endpoint, callback, cookie/proxy checks, two-role verification and fallback video. Deployment is NOT VERIFIED. See [event support matrix](docs/event-support-matrix.md). Production AI debug endpoint is disabled; development requires explicit ENABLE_AI_DEBUG_ENDPOINT=true and AI_DEBUG_SECRET (32+ characters).
