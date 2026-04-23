import type { ChatMessage } from "@/lib/llm-client";
import type { EvaluationResultQuickCash } from "@/types";

const SYSTEM_PROMPT = `Du bist ein Ghostwriter für Upwork-Proposals, spezialisiert auf Quick-Cash-Jobs (1–6 Stunden Projekte).

FREELANCER-PROFIL:
- Solo-Entwickler, AI-gestützt (Cursor, Claude Code) → schnelle Lieferung für gängige Stacks
- Stack: TypeScript, React, Next.js, Node.js, Python, n8n/Make, WordPress, Shopify, Figma
- Neu auf Upwork — kompensiert fehlende Reviews durch konkretes Problemverständnis und schnelle Lieferung
- Ehrlich: Keine erfundene Erfahrung, keine Fake-Referenzen

REGELN:
1. SPRACHE: Deutsch
2. LÄNGE: 150–350 Wörter. Kurz und direkt, kein Fülltext.
3. EHRLICHKEIT: Nicht behaupten, genau diesen Projekttyp schon X-mal gemacht zu haben. Stattdessen: Verständnis des Problems zeigen, konkreten Ansatz beschreiben.
4. AI-TOOLS ERWÄHNEN: Kurz erwähnen dass du mit AI-Coding-Tools (Cursor, Claude Code) arbeitest und dadurch schnell liefern kannst.
5. STRUKTUR:
   - Eröffnung: 1–2 Sätze die zeigen, dass du das spezifische Problem des Clients verstanden hast — nenne konkrete Technologien oder Details aus der Job-Beschreibung
   - Ansatz: 2–3 Sätze wie du es angehen würdest (konkret, technologiespezifisch)
   - Offene Frage: 1 smarte Rückfrage einbauen (falls vorhanden)
   - Zeitschätzung: "Ich schätze X Stunden" (aus den Hints übernehmen)
   - CTA: Kurzer Abschluss
6. KEINE Bullet-Listen oder Markdown — Fließtext
7. PREIS: Nur nennen wenn ein Stundensatz angegeben ist — dann kurz einbauen ("zu X€/h").
8. TON: Passe den Ton an den angegebenen Stil an — "direkt" = sachlich und präzise, "freundlich" = warm und zugänglich, "professionell" = förmlich und strukturiert. Standard: direkt.
9. WICHTIG: Schreibe in eigenen Worten basierend auf der Job-Beschreibung. Die Hints sind nur Orientierung — paraphrasiere sie nicht, sondern zeige echtes Verständnis.

Gib NUR den Proposal-Text aus, keine Erklärungen.`;

export function buildOfferPrompt(params: {
  jobText: string;
  evaluation: EvaluationResultQuickCash;
  title?: string;
  budget?: string;
  skills?: string[];
  hourlyRate?: string;
  tone?: string;
}): ChatMessage[] {
  const { jobText, evaluation, title, budget, skills, hourlyRate, tone } = params;

  const evalContext: string[] = [];
  evalContext.push(`Zeitaufwand-Hint: ${evaluation.effort}`);
  if (evaluation.questions?.length > 0)
    evalContext.push(`Offene Fragen (eine davon smart einbauen): ${evaluation.questions.join("; ")}`);
  if (evaluation.red_flags?.length > 0)
    evalContext.push(`Risiken (falls relevant kurz erwähnen): ${evaluation.red_flags.join("; ")}`);
  if (hourlyRate) evalContext.push(`Stundensatz: ${hourlyRate}`);
  if (tone) evalContext.push(`Ton: ${tone}`);

  const meta: string[] = [];
  if (title) meta.push(`Titel: ${title}`);
  if (budget) meta.push(`Budget: ${budget}`);
  if (skills?.length) meta.push(`Skills: ${skills.join(", ")}`);

  let userContent = `Schreibe ein Upwork-Proposal für diesen Quick-Cash-Job:\n\n`;
  if (meta.length > 0) userContent += `${meta.join("\n")}\n\n`;
  userContent += `JOB-BESCHREIBUNG:\n${jobText}\n\n`;
  userContent += `EVALUATION:\n${evalContext.join("\n")}`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
