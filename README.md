# Job Search Command Center

A **local-first**, single-user React app for tracking job opportunities, scoring them against your profile, and managing your search pipeline. There is **no backend**, **no database server**, and **no authentication** — everything persists in the browser via `localStorage`.

## Principles

- **Privacy**: Data never leaves your machine unless you export it.
- **Transparency**: Career scans show real outcomes; CORS failures and weak parses are explained, not hidden.
- **LinkedIn policy**: No scraping, automation, or crawlers. LinkedIn roles are **manual only** (URL + pasted description).

## Tech stack

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/) (via `@tailwindcss/vite`)
- [shadcn/ui](https://ui.shadcn.com/)-style primitives (Radix UI + `class-variance-authority` + `tailwind-merge`)
- [React Router](https://reactrouter.com/) for client-side routing

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build   # production build to dist/
npm run preview # serve dist/
```

## First launch & demo data

On the **first visit** (empty storage), the app seeds a **demo dataset** so screens are populated immediately. You can reset or reload demo data from **Import / Export**.

## Architecture

High-level separation of concerns:

| Area | Location | Responsibility |
|------|----------|----------------|
| **Domain types** | `src/domain/` | `Job`, `TrackedCompany`, `SearchProfile`, statuses, source labels |
| **Storage** | `src/storage/appStorage.ts` | `localStorage` read/write, import/export helpers |
| **Scoring** | `src/services/scoring/matchEngine.ts` | Weighted 0–100 score, strengths/concerns, breakdown |
| **Parsing** | `src/services/parsing/` | Greenhouse public API, generic HTML heuristics, career scanner orchestration |
| **UI state** | `src/context/app-state.tsx` | Mutations, persistence, toasts, scan orchestration |
| **Pages** | `src/pages/` | Dashboard, feed, detail, companies, intake, profile, import/export |
| **UI** | `src/components/ui/` | Reusable primitives; `components/layout`, `components/job` |

### Career scanning (important)

- **Greenhouse**: If a board token is detected (URL or HTML), the app calls the public API  
  `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`. The **token** is the path segment after  
  `boards.greenhouse.io/` or `job-boards.greenhouse.io/`. A made-up slug returns **404** from the API;  
  then the app tries to fetch the board HTML, which often fails from **localhost** due to **CORS**.  
  Use a real board URL (open the company’s careers page and copy it) or **Paste HTML**.
- **Generic HTML**: Best-effort link extraction via `DOMParser`. No headless browser — **JavaScript-only job boards will often parse poorly**.
- **CORS**: Many company sites block cross-origin `fetch` from the browser. **`npm run dev`** includes a small Vite middleware (`/__career_fetch`) that loads career HTML **server-side**, so **Scan jobs** usually works for public URLs while developing. **`vite preview`** and static hosting have **no** proxy — use **Paste HTML** or a real Greenhouse API URL there.

### Matching engine

Scores are computed from your **Profile** using weighted dimensions (title, seniority, domain, location, keywords, strategic). Saving the profile **re-scores all jobs** locally.

## Data model (export)

Exported JSON includes `profile`, `companies`, `jobs`, and `scanHistory`. Use **Import / Export** for backups before clearing browser data.

## Scripts

- `npm run dev` — development server  
- `npm run build` — typecheck + production bundle  
- `npm run preview` — preview production build  
- `npm run lint` — ESLint  

## License

Private / personal use — no license file included by default.
