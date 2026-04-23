# Upwork Quick Cash Evaluator

Bewertet Upwork-Job-Postings automatisch auf schnelle, profitable Aufgaben (1–6h, klares Deliverable). Nutzt LLMs via OpenRouter zur Analyse von Aufwand, Risiken und Score-Kalibrierung — und generiert direkt nutzbare Proposals auf Deutsch.

## Features

- **Quick Cash Score**: 0–100 Bewertung mit kalibrierten Bändern anhand echter Upwork-Jobs
- **Proposal-Generierung**: LLM-Ghostwriter mit konfigurierbarem Stundensatz und Ton (direkt / freundlich / professionell)
- **Chrome Extension**: Ein-Klick-Extraktion von Upwork Job-Detailseiten, Feed und Search-Seiten
- **Batch-Bewertung**: Mehrere Jobs gleichzeitig (Feed-HTML oder `---`-Trenner)
- **Dual-Model-Strategie**: Primary + Fallback Modell mit Deadline-Race und automatischem JSON-Repair
- **Ergebnis-Verlauf**: Gefiltert nach Score (70+, 80+, 90+), Suche, Bulk Delete
- **Robuste Dedup**: Upwork Job-ID + Text-Hash, server-seitig persistent (SQLite)
- **Caching**: Identische Jobs werden nicht doppelt evaluiert (1h In-Memory)
- **Rate Limiting**: IP-basierter Schutz

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript 5, Tailwind CSS
- **Backend**: Next.js API Routes, SQLite (better-sqlite3)
- **HTML-Parsing**: Cheerio
- **LLM-API**: OpenRouter
- **Testing**: Vitest (91 Tests)

## Setup

```bash
npm install

cp .env.example .env
# → OPENROUTER_API_KEY eintragen

npm run dev
```

App: http://localhost:3000

## Konfiguration (.env)

| Variable | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Ja | — | OpenRouter API Key |
| `OPENROUTER_MODEL_PRIMARY` | Nein | `google/gemini-flash-preview` | Primäres LLM-Modell |
| `OPENROUTER_MODEL_FALLBACK` | Nein | `openai/gpt-4o-mini` | Fallback-Modell |
| `OPENROUTER_OFFER_MODEL` | Nein | wie PRIMARY | Modell für Proposal-Generierung |
| `OPENROUTER_HEDGE` | Nein | `1` | Beide Modelle parallel starten |
| `OPENROUTER_REPAIR` | Nein | `1` | JSON-Repair bei fehlerhaften Responses |
| `OPENROUTER_DEADLINE_MS` | Nein | `15000` | Max. Wartezeit sync (ms) |
| `OPENROUTER_REQUEST_TIMEOUT_MS` | Nein | `12000` | Request Timeout pro Modell sync (ms) |
| `OPENROUTER_ASYNC_DEADLINE_MS` | Nein | `90000` | Max. Wartezeit async (ms) |
| `OPENROUTER_ASYNC_REQUEST_TIMEOUT_MS` | Nein | `35000` | Request Timeout pro Modell async (ms) |
| `LOG_EVALUATIONS` | Nein | `0` | JSONL-Logging aktivieren |

## Scripts

```bash
npm run dev           # Development Server
npm run build         # Production Build
npm run start         # Production Server
npm run lint          # ESLint
npm run test          # Vitest
npm run test:watch    # Vitest Watch-Modus
npm run test:coverage # Vitest mit Coverage
```

## Chrome Extension

Extrahiert Jobs direkt von Upwork — kein manuelles Copy-Paste nötig.

### Installation

1. Chrome → `chrome://extensions`
2. **Entwicklermodus** aktivieren
3. **"Entpackte Erweiterung laden"** → `extension/` Ordner wählen
4. Extension-Icon in der Toolbar pinnen

### Nutzung

| Seite | Button | Aktion |
|---|---|---|
| Job-Detailseite (`/jobs/~XXX`) | "Job extrahieren & bewerten" | Öffnet App mit laufender Evaluation |
| Feed (`/nx/find-work/...`) | "Feed-Seite extrahieren" | Alle sichtbaren Jobs auf einmal |
| Search Jobs (`/nx/search/jobs`) | "Search Jobs → Quick Cash" | Alle sichtbaren Jobs → Quick Cash |

### Sicherheit

- Kein Content-Script — nichts läuft permanent auf Upwork-Seiten
- `chrome.scripting.executeScript` mit `world: "ISOLATED"` — Upwork's JS kann die Extraktion nicht sehen
- Daten gehen nur an `localhost:3000`
- Extension wird nur bei Klick aktiv (`activeTab` Permission)

## API

### POST /api/parse
Wandelt Raw-Input (HTML/Text) in strukturierte Jobs um.
```
Request:  { "rawText": "..." }
Response: { "jobs": [{ "jobText": "...", "title": "...", "source": "upwork_feed"|"text", ... }] }
```

### POST /api/evaluate-quick
Startet Quick-Cash-Bewertung (async empfohlen).
```
Request:  { "jobText": "...", "async": true, "meta": { "title": "...", "jobUrl": "..." } }
Response: { "jobId": "uuid" }  HTTP 202
```

### GET /api/evaluate-quick?jobId=...
Pollt Status einer async Bewertung.
```
Response: { "status": "queued"|"running"|"done"|"error", "result": {...} }
```

### GET /api/evaluate-quick/stream?jobId=...
SSE-Stream für Live-Updates einer Bewertung.

### GET /api/evaluations
Gibt gespeicherte Bewertungen zurück.
```
Query: ?minScore=70&search=shopify
Response: { "entries": [...] }
```

### DELETE /api/evaluations
Löscht eine oder mehrere Bewertungen.
```
Request: { "ids": ["uuid1", "uuid2"] }
```

### POST /api/generate-offer
Generiert einen Proposal-Text.
```
Request:  { "evaluationId": "uuid", "hourlyRate": "45€/h", "tone": "direkt"|"freundlich"|"professionell" }
Response: { "offer": "..." }
```

## Architektur

```
Chrome Extension
  └─ POST /api/extension/pending  →  pendingId
  
Browser (page.tsx)
  ├─ POST /api/parse              →  strukturierte Jobs
  ├─ POST /api/evaluate-quick     →  jobId (async)
  ├─ GET  /api/evaluate-quick/stream?jobId  →  SSE Live-Updates
  ├─ GET  /api/evaluate-quick?jobId         →  Polling Fallback
  └─ POST /api/generate-offer     →  Proposal-Text

ResultsTable (Tab 2)
  ├─ GET  /api/evaluations        →  gespeicherte Jobs
  ├─ DELETE /api/evaluations      →  Bulk Delete
  └─ POST /api/generate-offer     →  Cover Letter
```

**Key Modules**:

| Modul | Funktion |
|---|---|
| `lib/evaluation-engine.ts` | Kern-Engine: LLM Race, Repair, Dedup, Auto-Save |
| `lib/eval-prompts.ts` | System-Prompts (kalibriert anhand echter Upwork-Jobs) |
| `lib/eval-validator.ts` | Schema-Validierung, Deutsch-Check, Placeholder-Check |
| `lib/offer-prompt.ts` | Proposal-Ghostwriter-Prompt |
| `lib/llm-client.ts` | OpenRouter HTTP-Client mit Timeout/Abort |
| `lib/eval-cache.ts` | In-Memory Response-Cache (1h TTL) |
| `lib/db.ts` | SQLite mit Migrationen (v2: quick_cash_score + job_text_hash Spalten) |
| `lib/rateLimit.ts` | IP-basiertes Sliding Window Rate Limiting |
| `lib/constants.ts` | Alle konfigurierbaren Werte |

## Projektstruktur

```
app/
  page.tsx                        # Hauptseite (Eingabe + Batch + Ergebnisse)
  api/
    parse/route.ts                # HTML → strukturierte Jobs
    evaluate-quick/
      route.ts                    # Quick Cash Bewertung (async + sync)
      stream/route.ts             # SSE-Stream für Live-Updates
    evaluations/
      route.ts                    # GET/POST/DELETE gespeicherte Bewertungen
      [id]/route.ts               # Einzelner Eintrag (Update/Delete)
    generate-offer/route.ts       # Proposal-Generierung
    extension/pending/route.ts    # Extension Relay (Text-Übergabe)
    health/route.ts               # Health Check
components/
  EvaluationResultCard.tsx        # Ergebnis-Anzeige (Score, Why, Red Flags, Proposal)
  ResultsTable.tsx                # Verlauf mit Filtern, Bulk Delete, Cover Letter
  CoverLetterPanel.tsx            # Inline Proposal-Generierung
lib/
  evaluation-engine.ts            # Engine Factory (GET/POST Handler + evaluateWithPolicy)
  eval-prompts.ts                 # System-Prompts
  eval-validator.ts               # Validierung (Schema, Deutsch, Placeholder)
  eval-cache.ts                   # In-Memory Cache
  offer-prompt.ts                 # Proposal-Prompt Builder
  api-client.ts                   # Frontend API-Wrapper
  llm-client.ts                   # OpenRouter HTTP-Client
  db.ts                           # SQLite CRUD
  constants.ts                    # Konfigurationswerte
  rateLimit.ts                    # Rate Limiting
  normalizeJobInput.ts            # HTML/Text → Clean Text
  extractUpworkHtml.ts            # Upwork HTML → Job-Text
  splitJobs.ts                    # Multi-Job Splitting
  upwork-job-id.ts                # Upwork Job-ID Extraktion
types/
  index.ts                        # Shared TypeScript Types
extension/
  manifest.json                   # Chrome Extension Manifest V3
  popup.html / popup.js           # Extension Popup UI
  extract-job.js                  # Job-Detailseite Extraktion
  extract-feed.js                 # Feed + Search Jobs Extraktion
__tests__/
  lib/                            # Unit Tests (91)
```
