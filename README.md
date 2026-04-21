# Upwork Job Evaluator

Bewertet Upwork-Job-Postings automatisch auf Eignung als Solo-Side-Hustle mit Cursor & AI-Coding. Nutzt LLMs (Gemini / GPT via OpenRouter) zur Analyse von Machbarkeit, Aufwand, Risiken und generiert Angebotstexte.

## Features

- **Job-Bewertung**: Paste von Upwork-HTML oder Text → automatische Analyse
- **AI-Coding-Fit**: Zentrale Bewertung ob der Job mit Vibe Coding (Cursor/Claude Code) umsetzbar ist
- **Chrome Extension**: Ein-Klick Extraktion von Upwork Job-Seiten und Feed — keine manuelle Copy-Paste nötig
- **Zwei Workflows**:
  - **Sidehustle** (BUILD ≤20h / CONSULTING Setup + Handover)
  - **Quick Cash**: Fokus auf schnelle, kleine Jobs (1–6h / max. 1 Tag) + Proposal auf Deutsch
- **Multi-Job**: Mehrere Jobs gleichzeitig bewerten (Feed-HTML oder `---` Trenner)
- **Angebotstext-Generierung**: Separater LLM-Schritt mit ehrlicher Persona (Claude Sonnet 4) für Upwork-Proposals
- **Dual-Model-Strategie**: Primary + Fallback Modell mit Deadline-Race
- **JSON-Repair**: Automatische Reparatur fehlerhafter LLM-Responses
- **Robuste Dedup**: Upwork Job-ID + Text-Hash, server-seitig persistent (SQLite)
- **Verlauf mit Filtern**: Score-Range, AI-Coding-Fit, Viable, Starred, Tags, Metadata-Anzeige
- **Persistenz**: SQLite (Server) + localStorage (Client) mit automatischem Sync
- **Caching**: Identische Jobs werden nicht doppelt evaluiert
- **Rate Limiting**: IP-basierter Schutz gegen Missbrauch

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript 5, Tailwind CSS
- **Backend**: Next.js API Routes
- **HTML-Parsing**: Cheerio
- **LLM-API**: OpenRouter (Gemini, GPT)
- **Storage**: SQLite (better-sqlite3), Browser localStorage, In-Memory Map (Server)
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
| `OPENROUTER_DEADLINE_MS` | Nein | `15000` | Max. Wartezeit (sync) |
| `OPENROUTER_REQUEST_TIMEOUT_MS` | Nein | `12000` | Request Timeout pro Modell (sync) |
| `OPENROUTER_ASYNC_DEADLINE_MS` | Nein | `90000` | Max. Wartezeit (async) |
| `OPENROUTER_ASYNC_REQUEST_TIMEOUT_MS` | Nein | `35000` | Request Timeout pro Modell (async) |
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

## Chrome Extension

Die Extension extrahiert Jobs direkt von Upwork-Seiten — kein manuelles Copy-Paste nötig.

### Installation

1. Chrome öffnen → `chrome://extensions`
2. **Entwicklermodus** aktivieren (Toggle oben rechts)
3. **"Entpackte Erweiterung laden"** → den `extension/` Ordner auswählen
4. Extension-Icon in der Toolbar pinnen

### Nutzung

- **Job-Detailseite** (`upwork.com/jobs/~XXX`): Klick auf "Job extrahieren & bewerten" → App öffnet sich mit laufender Evaluation
- **Feed-Seite** (`/nx/find-work/...`): Klick auf "Feed-Seite extrahieren (alle Jobs)" → alle sichtbaren Jobs werden auf einmal extrahiert und bewertet
- **Search Jobs Seite** (`/nx/search/jobs?...`): Klick auf **"Search Jobs → Quick Cash (alle Jobs)"** → alle sichtbaren Jobs werden extrahiert und im Quick-Cash Workflow bewertet

### Quick Cash Modus

- In der App gibt es einen **Modus-Switch** (Sidehustle vs Quick Cash).
- Die Extension öffnet die App mit `mode=quick_cash` (URL-Parameter), damit direkt der Quick-Cash Flow genutzt wird.

### Sicherheit

- **Kein Content-Script**: Nichts läuft permanent auf Upwork-Seiten
- **Isolated World**: `chrome.scripting.executeScript` mit `world: "ISOLATED"` — Upwork's JavaScript kann die Extraktion nicht sehen
- **Kein externer Traffic**: Daten gehen nur an `localhost:3000`
- **Nur bei Klick**: Extension wird nur aktiv wenn du den Button drückst (`activeTab` Permission)

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

### POST /api/evaluate-quick

Startet eine **Quick-Cash** Bewertung (eigener Prompt + eigenes Schema).

**Request**: `{ "jobText": "...", "async": true, "meta": {...} }`
**Response (async)**: `{ "jobId": "uuid" }` (HTTP 202)

### GET /api/evaluate-quick?jobId=...

Pollt den Status einer async Quick-Cash Bewertung.

**Response**: `{ "status": "queued"|"running"|"done"|"error", "result": {...} }`

### POST /api/evaluations

Speichert bewertete Jobs in SQLite.

**Request**: `{ "entries": [{ "id": "...", "savedAt": "...", "jobSnippet": "...", "evaluation": {...}, ... }] }`

### GET /api/evaluations

Gibt gespeicherte Bewertungen zurück (mit optionalen Filtern `?search=`, `?viable=`, `?starred=`).

### POST /api/generate-offer

Generiert einen Angebotstext für einen gespeicherten Job.

**Request**: `{ "evaluationId": "uuid" }` oder `{ "jobSnippet": "...", "evaluation": {...} }`
**Response**: `{ "offerText": "..." }`

### GET/POST /api/seen-jobs

Verwaltet die "gesehen"-Marker für Job-Dedup (Text-Hash + Upwork Job-ID).

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
  history/page.tsx          # Gespeicherte Bewertungen mit Filtern
  compare/page.tsx          # Radar-Chart Vergleich (2-3 Jobs)
  stats/page.tsx            # Statistik-Dashboard
  templates/page.tsx        # Angebotstext-Vorlagen
  layout.tsx                # Root Layout mit Navigation
  api/
    parse/route.ts          # HTML → strukturierte Jobs
    evaluate/route.ts       # LLM-Bewertung (async + sync)
    evaluate-quick/route.ts # Quick Cash Bewertung (async + sync)
    evaluations/route.ts    # CRUD für gespeicherte Bewertungen (SQLite)
    generate-offer/route.ts # Angebotstext-Generierung (Claude Sonnet 4)
    seen-jobs/route.ts      # Dedup-Marker (Hash + Upwork Job-ID)
    feed/route.ts           # Upwork Feed-Abruf
components/
  JobForm.tsx               # Textarea + Paste-Handler
  JobRunCard.tsx            # Einzelne Job-Bewertung
  EvaluationResultCard.tsx  # Ergebnis-Anzeige (V1/V2)
  FeedRefreshButton.tsx     # Feed-Refresh aus der App
hooks/
  useEvaluationHistory.ts   # SQLite + localStorage Sync
  useSeenJobs.ts            # Multi-Signal Dedup (Upwork-ID + Text-Hash)
  useOfferTemplates.ts      # Angebotstext-Vorlagen
lib/
  api-client.ts             # Frontend API-Wrapper
  constants.ts              # Alle konfigurierbaren Werte
  llm-client.ts             # OpenRouter HTTP-Client
  db.ts                     # SQLite (better-sqlite3) mit Migrationen
  eval-prompts.ts           # LLM System-Prompts (AI-Coding-Fit zentral)
  eval-validator.ts         # Response-Validierung + Semantic Quality
  eval-cache.ts             # In-Memory Response-Cache
  offer-prompt.ts           # Angebotstext-Prompt (ehrliche Persona)
  upwork-job-id.ts          # Upwork Job-ID Extraktion
  rateLimit.ts              # IP Rate Limiting
  normalizeJobInput.ts      # HTML/Text → Clean Text
  splitJobs.ts              # Multi-Job Splitting
types/
  index.ts                  # Shared TypeScript Types
extension/
  manifest.json             # Chrome Extension (Manifest V3)
  popup.html/js             # Extension Popup UI
  extract-job.js            # Job-Detailseite Extraktion
  extract-feed.js           # Feed + Search Jobs Extraktion
__tests__/
  lib/                      # Unit Tests für lib/*
```

## Maintenance / DB Cleanup

Wenn du alte DB-Einträge reparieren oder Duplikate bereinigen willst:

```bash
python scripts/backfill-db.py
python scripts/dedup-by-content.py
```
