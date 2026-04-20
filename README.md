# Upwork Job Evaluator

Bewertet Upwork-Job-Postings automatisch auf Eignung als Solo-Side-Hustle mit Cursor & AI-Coding. Nutzt LLMs (Gemini / GPT via OpenRouter) zur Analyse von Machbarkeit, Aufwand, Risiken und generiert Angebotstexte.

## Features

- **Job-Bewertung**: Paste von Upwork-HTML oder Text → automatische Analyse
- **Zwei Modi**: BUILD (≤20h Solo) und CONSULTING (Setup + Handover)
- **Multi-Job**: Mehrere Jobs gleichzeitig bewerten (Feed-HTML oder `---` Trenner)
- **Dual-Model-Strategie**: Primary + Fallback Modell mit Deadline-Race
- **JSON-Repair**: Automatische Reparatur fehlerhafter LLM-Responses
- **Verlauf**: Lokale Speicherung bewerteter Jobs im Browser
- **Caching**: Identische Jobs werden nicht doppelt evaluiert
- **Rate Limiting**: IP-basierter Schutz gegen Missbrauch

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript 5, Tailwind CSS
- **Backend**: Next.js API Routes
- **HTML-Parsing**: Cheerio
- **LLM-API**: OpenRouter (Gemini, GPT)
- **Storage**: Browser localStorage (Client), In-Memory Map (Server)
- **Testing**: Vitest

## Setup

```bash
# Dependencies installieren
npm install

# .env aus Template erstellen
cp .env.example .env
# → OPENROUTER_API_KEY eintragen

# Development Server starten
npm run dev
```

App öffnen: http://localhost:3000

## Konfiguration (.env)

| Variable | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Ja | — | OpenRouter API Key |
| `OPENROUTER_MODEL_PRIMARY` | Nein | `google/gemini-3-flash-preview` | Primäres LLM-Modell |
| `OPENROUTER_MODEL_FALLBACK` | Nein | `openai/gpt-5.4-mini` | Fallback-Modell |
| `OPENROUTER_HEDGE` | Nein | `1` | Beide Modelle parallel starten |
| `OPENROUTER_REPAIR` | Nein | `1` | JSON-Repair bei fehlerhaften Responses |
| `OPENROUTER_DEADLINE_MS` | Nein | `10000` | Max. Wartezeit (sync) |
| `LOG_EVALUATIONS` | Nein | `0` | JSONL-Logging aktivieren |

## Scripts

```bash
npm run dev          # Development Server
npm run build        # Production Build
npm run start        # Production Server
npm run lint         # ESLint
npm run test         # Alle Tests (Vitest)
npm run test:watch   # Tests im Watch-Modus
npm run test:coverage # Tests mit Coverage
```

## API-Endpoints

### POST /api/parse

Wandelt Raw-Input (HTML/Text) in strukturierte Jobs um.

**Request**: `{ "rawText": "..." }`
**Response**: `{ "jobs": [{ "source": "upwork_feed"|"text", "jobText": "...", "title": "...", ... }] }`

### POST /api/evaluate

Startet eine LLM-Bewertung.

**Request**: `{ "jobText": "...", "async": true, "meta": {...} }`
**Response (async)**: `{ "jobId": "uuid" }` (HTTP 202)

### GET /api/evaluate?jobId=...

Pollt den Status einer async Bewertung.

**Response**: `{ "status": "queued"|"running"|"done"|"error", "result": {...} }`

## Architektur

```
Browser (page.tsx)
  │
  ├─ POST /api/parse ──→ HTML-Parsing (Cheerio) → Structured Jobs
  │
  ├─ POST /api/evaluate ──→ Cache Check → LLM Race (Primary + Fallback)
  │                                         ├─ JSON Parse + Validate
  │                                         └─ Optional Repair Loop
  │
  └─ GET /api/evaluate?jobId=... ──→ Poll Status + Result
```

**Key Modules**:
- `lib/llm-client.ts` — OpenRouter HTTP-Client mit Timeout/Abort
- `lib/eval-validator.ts` — Schema-Validierung, Deutsch-Check, Placeholder-Check
- `lib/eval-prompts.ts` — System-Prompts als Konstanten
- `lib/eval-cache.ts` — In-Memory Response-Cache (1h TTL)
- `lib/rateLimit.ts` — IP-basiertes Sliding Window Rate Limiting
- `lib/constants.ts` — Alle konfigurierbaren Werte zentral

## Projektstruktur

```
app/
  page.tsx                  # Hauptseite (Job-Eingabe + Ergebnisse)
  history/page.tsx          # Gespeicherte Bewertungen
  layout.tsx                # Root Layout mit Navigation
  api/
    parse/route.ts          # HTML → strukturierte Jobs
    evaluate/route.ts       # LLM-Bewertung (async + sync)
components/
  JobForm.tsx               # Textarea + Paste-Handler
  JobRunCard.tsx             # Einzelne Job-Bewertung
  EvaluationResultCard.tsx  # Ergebnis-Anzeige (V1/V2)
  ErrorBoundary.tsx         # React Error Boundary
  LoadingSkeleton.tsx       # Loading-Animation
hooks/
  useEvaluationHistory.ts   # localStorage Hook mit Versionierung
lib/
  api-client.ts             # Frontend API-Wrapper
  constants.ts              # Alle Magic Numbers zentral
  llm-client.ts             # OpenRouter HTTP-Client
  eval-prompts.ts           # LLM System-Prompts
  eval-validator.ts         # Response-Validierung
  eval-cache.ts             # Response-Caching
  rateLimit.ts              # IP Rate Limiting
  normalizeJobInput.ts      # HTML/Text → Clean Text
  splitJobs.ts              # Multi-Job Splitting
  ...
types/
  index.ts                  # Shared TypeScript Types
__tests__/
  lib/                      # Unit Tests für lib/*
```
