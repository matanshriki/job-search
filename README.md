# Job Search Agent Copilot

A local-first, full-stack job search management system with a 5-agent AI layer.  
Runs entirely on your machine. No auth, no cloud, no paid services required.

---

## What it does

1. **Scans** company career pages (Greenhouse API + generic HTML) for new openings
2. **Scores** every role against your profile using a 6-dimension rules engine
3. **Enriches** high-match roles with AI: fit analysis, resume tailoring, outreach drafts, interview prep
4. **Tracks** everything in a local SQLite database with full history
5. **Surfaces** insights in a clean dashboard and tabbed job workspace

---

## Architecture

```
job-search/
├── src/                    # Frontend: React 19 + TypeScript + Vite + Tailwind CSS
│   ├── context/            # api-state.tsx (API-backed) + app-state-compat.tsx (adapter)
│   ├── services/api.ts     # Typed API client — all backend calls go through here
│   └── pages/              # Dashboard, Jobs, Job Detail, Companies, Profile, Import/Export, …
│
└── backend/                # Backend: Node.js + Express + TypeScript
    ├── prisma/schema.prisma # SQLite schema (12 entities)
    ├── src/
    │   ├── routes/          # REST API: profile, companies, jobs, agents, dashboard, import/export
    │   ├── services/        # Scoring engine, career scanner, AI abstraction
    │   ├── agents/          # Scout, Fit Analyst, Resume Tailor, Outreach, Interview Prep
    │   ├── prompts/         # AI prompt builders (leadership-biased)
    │   └── utils/           # seed.ts, migrate.ts, runAgent.ts
    └── data/job-search.db   # SQLite database (auto-created on first migration)
```

---

## First-Time Setup

### Prerequisites

- Node.js 20+
- npm 9+

### Step 1 — Install dependencies

```bash
# In the project root:
npm install

# Then install backend dependencies:
cd backend && npm install && cd ..
```

### Step 2 — Create environment files

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
```

The defaults work out of the box for local development.  
Edit `backend/.env` to add an OpenAI API key if you want real AI output (see AI section below).

### Step 3 — Create the database

```bash
cd backend
npx prisma migrate deploy
cd ..
```

This creates `backend/data/job-search.db` (SQLite) and runs all schema migrations.

### Step 4 — Seed demo data (recommended for first run)

```bash
npm run db:seed
```

This populates the database with:
- A PS/leadership-focused candidate profile
- A base resume template
- 5 sample companies with career page sources
- 10 sample job postings pre-scored against the profile

### Step 5 — Start both servers

```bash
npm run dev:all
```

This starts:
- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:3001

Open http://localhost:5173 in your browser.

---

## Environment Variables

### Frontend — `.env.local` (root)

```env
VITE_API_URL=http://localhost:3001
```

### Backend — `backend/.env`

```env
DATABASE_URL="file:./data/job-search.db"
PORT=3001
NODE_ENV=development

# Background scheduler
SCHEDULER_ENABLED=true
SCAN_INTERVAL_HOURS=6

# AI (optional — mock mode works without a key)
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
# AI_BASE_URL=https://api.openai.com/v1  # default

# For local models (Ollama / LM Studio):
# AI_BASE_URL=http://localhost:11434/v1
# AI_MODEL=llama3.2
# OPENAI_API_KEY=ollama
```

---

## Daily Usage

### Run everything

```bash
npm run dev:all
```

### Individual servers

```bash
npm run dev           # Frontend only (Vite)
npm run dev:backend   # Backend only (tsx watch)
```

### Database

```bash
npm run db:migrate    # Create/apply new migrations after schema changes
npm run db:seed       # Re-seed with demo data (CLEARS existing data)
npm run db:studio     # Open Prisma Studio to browse the database
```

### Manual agent triggers

```bash
# Scan all active companies for new jobs
npm run agent:scan

# Run fit analysis on relevant jobs without one
npm run agent:fit

# Or trigger individual agents:
cd backend
npx tsx src/utils/runAgent.ts scan
npx tsx src/utils/runAgent.ts fit
npx tsx src/utils/runAgent.ts resume   # requires --jobId flag
npx tsx src/utils/runAgent.ts outreach
npx tsx src/utils/runAgent.ts interview
```

### Migrate from the old localStorage app

If you have a JSON export from the previous version:

```bash
npm run migrate:import path/to/export.json
# or pipe:
cat export.json | npm run migrate:import
```

---

## AI Setup

### Mock mode (default, no key needed)

Without `OPENAI_API_KEY`, all agents return realistic mock outputs so the full UI works.

### OpenAI

Set `OPENAI_API_KEY` in `backend/.env`.  
Recommended model: `gpt-4o-mini` (fast, cheap, good at structured JSON output).

### Local models (Ollama / LM Studio)

```env
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
OPENAI_API_KEY=ollama
```

Models that work well: `llama3.2`, `mistral`, `qwen2.5`. Ensure the model supports JSON output mode.

---

## Pages & Features

| Page | What it does |
|------|-------------|
| Dashboard | Stats overview: new jobs, high matches, recent scans, agent run health |
| Jobs feed | Full job list with filters, scoring, status pipeline |
| Job Detail | 8-tab workspace: Overview, Score, Fit Analysis, Resume, Outreach, Interview Prep, Notes, Activity |
| Companies | Track career pages, trigger scans, view scan history |
| Profile | Set target titles, functions, geographies, seniority, keywords, personal identity |
| Resumes | Manage base resume + variants (text paste, used by all agents) |
| Generated Assets | Browse all AI outputs across jobs by type |
| Agent Runs | History of all agent and scan runs, mock mode indicator |
| Source Health | Per-company scan health, stale sources, job counts |
| Import / Export | Full database export/import (JSON), legacy format support |

---

## Agent Layer

Five lightweight agent workflows run on demand or on a schedule:

| Agent | Trigger | Output |
|-------|---------|--------|
| Scout | Scheduled / manual | Discovers new jobs, scores them, creates notifications |
| Fit Analyst | Auto after scan (if score ≥ threshold) | Fit label, summary, matching reasons, concerns, resume points |
| Resume Tailor | Manual (Job Detail tab) | Tailored summary, prioritized bullets, keyword suggestions |
| Outreach | Manual (Job Detail tab) | Recruiter message, LinkedIn note, cover note, networking angle |
| Interview Prep | Manual (Job Detail tab) | 60s intro, why company/role, questions, objections, talking points |

All agent outputs are stored as `GeneratedAsset` records and displayed in the Job Detail workspace.

---

## Scoring Engine

6-dimension rules-based scoring (0–100):

| Dimension | Weight | What it checks |
|-----------|--------|---------------|
| Title fit | 25% | Overlap between job title and your target titles |
| Seniority fit | 15% | Level match (director, executive, etc.) |
| Domain fit | 20% | Function/industry alignment |
| Location fit | 15% | Geography keyword match |
| Keyword fit | 15% | Boost/penalize keywords in description |
| Strategic fit | 10% | Company stage, personal summary alignment |

AI fit analysis provides a second opinion on top of the rules engine.

---

## Troubleshooting

### "Backend offline" banner in the app

The frontend cannot reach the backend. Common causes:
1. Backend not started — run `npm run dev:all` or `npm run dev:backend`
2. Wrong port — check `VITE_API_URL` in `.env.local` matches `PORT` in `backend/.env`
3. Database not created — run `cd backend && npx prisma migrate deploy`

### "Cannot find module '@prisma/client'" or Prisma errors

```bash
cd backend
npx prisma generate
```

### Backend starts but API returns 500 errors

Check that the database file exists at `backend/data/job-search.db`.  
If not: `cd backend && npx prisma migrate deploy`

### Blank dashboard / no jobs after seed

1. Confirm the seed completed: `npm run db:seed` should print `✅ Seed complete`
2. Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)
3. Check the backend console for errors

### TypeScript build errors on frontend

```bash
npm run build     # runs tsc + vite build
```

If you see type errors, check that you haven't edited generated files in `src/context/`.

### "EPERM operation not permitted" running seed or migrate

This is a Node.js sandbox/permissions issue on some systems.  
Try: `cd backend && node --loader ts-node/esm src/utils/seed.ts`  
Or open a terminal outside any restricted environment.

### Scan returns 0 jobs / CORS errors

Career page scanning runs server-side (no CORS issues for most sites).  
If a company uses an unusual ATS, try:
- In Companies page → expand the company → click "Paste HTML"
- Copy the career page HTML from your browser (Cmd+A, copy-source) and paste it

---

## Adding Companies

1. Go to **Companies** → "Add company"
2. Enter the company name and careers page URL (e.g. `https://company.greenhouse.io/`)
3. Click **Scan** — the Scout Agent fetches and parses jobs
4. For Greenhouse companies, the API is used automatically for reliable results

---

## Resumes

1. Go to **Resumes** → "Add resume"
2. Paste your resume text (plain text or markdown)
3. Mark it as **Base Resume** — this is what agents use for tailoring

---

## Data Location

All data is stored locally:
- Database: `backend/data/job-search.db` (SQLite)
- No cloud sync, no external accounts required

Export a backup anytime: **Import / Export** → "Download JSON backup"

---

## Contributing / Extending

Key extension points:
- **New ATS parser**: `backend/src/services/parsing/` — add a new file, export a `parse()` function
- **New agent**: `backend/src/agents/` + `backend/src/prompts/` + register in `backend/src/routes/agents.ts`
- **New scoring dimension**: `backend/src/services/scoring/matchEngine.ts`
