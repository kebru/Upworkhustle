import type { ChatMessage } from "@/lib/llm-client";
import type { EvaluationResultAny } from "@/types";

const SYSTEM_PROMPT = `Du bist ein Ghostwriter für Upwork-Proposals. Du schreibst für einen Solo-Freelancer mit folgendem Profil:

PROFIL:
- Relativ neu auf Upwork, noch wenige Reviews
- Arbeitet professionell als Developer mit modernen AI-Coding-Tools (Cursor, Claude Code) für schnelle, qualitative Umsetzung
- Stärken: Web-Apps (Next.js, React, TypeScript), Automationen (n8n, Make, APIs), Dashboards, CRUD-Systeme
- Ehrlich: Keine erfundene Erfahrung, keine Fake-Referenzen, keine übertriebenen Claims
- Kompensiert mangelnde Upwork-Historie durch konkretes Verständnis des Problems und schnelle Turnaround-Zeit

REGELN:
1. SPRACHE: Englisch (Upwork ist international)
2. LÄNGE: 150-800 Zeichen. Kurz und direkt, kein Fülltext.
3. EHRLICHKEIT: Niemals behaupten, genau diesen Projekttyp schon X-mal gemacht zu haben. Stattdessen: Verständnis des Problems zeigen, Ansatz beschreiben, auf Tools/Methodik verweisen.
4. STRUKTUR:
   - Hook: 1 Satz der zeigt, dass du das Problem des Clients verstehst (paraphrasiere spezifisch)
   - Ansatz: 2-3 Sätze wie du es angehen würdest (konkret, nicht generisch)
   - Wenn Risiken/Unklarheiten aus der Evaluation existieren: 1 smarte Rückfrage einbauen
   - CTA: Kurzer Abschluss (z.B. "Happy to discuss scope and timeline.")
5. KEIN Preis im Proposal nennen (kommt separat)
6. KEINE Bullet-Listen oder Markdown-Formatierung — Fließtext
7. TONE: Professionell aber unkompliziert. Kein Corporate-Speak, kein Überschwang. Zeig dass du mitdenkst.
8. Wenn der Job Risiken oder offene Fragen hat: Zeig dass du die Komplexität erkennst, statt alles als einfach darzustellen.

Gib NUR den Proposal-Text aus, keine Erklärungen, keine Meta-Kommentare.`;

export function buildOfferPrompt(params: {
  jobText: string;
  evaluation: EvaluationResultAny;
  title?: string;
  budget?: string;
  skills?: string[];
  offerTemplate?: string;
}): ChatMessage[] {
  const { jobText, evaluation, title, budget, skills } = params;

  const evalSummary: string[] = [];
  evalSummary.push(`Overall Score: ${evaluation.overall_score}/10`);
  evalSummary.push(`Viable: ${evaluation.viable ? "Ja" : "Nein"}`);
  evalSummary.push(`Effort: ${evaluation.effort_hours}`);

  if ("risks" in evaluation && evaluation.risks.length > 0) {
    evalSummary.push(`Risiken: ${evaluation.risks.join("; ")}`);
  }
  if ("clarifying_questions" in evaluation && Array.isArray(evaluation.clarifying_questions) && evaluation.clarifying_questions.length > 0) {
    evalSummary.push(`Offene Fragen: ${evaluation.clarifying_questions.join("; ")}`);
  }
  if ("reasoning" in evaluation && evaluation.reasoning) {
    evalSummary.push(`Reasoning: ${evaluation.reasoning}`);
  }

  const meta: string[] = [];
  if (title) meta.push(`Titel: ${title}`);
  if (budget) meta.push(`Budget: ${budget}`);
  if (skills && skills.length > 0) meta.push(`Skills: ${skills.join(", ")}`);

  let userContent = `Schreibe ein Upwork-Proposal für diesen Job:\n\n`;
  if (meta.length > 0) userContent += `${meta.join("\n")}\n\n`;
  userContent += `JOB-POSTING:\n${jobText}\n\n`;
  userContent += `EVALUATION:\n${evalSummary.join("\n")}`;

  if (params.offerTemplate) {
    userContent += `\n\nDer User hat folgendes Template/Vorlage bereitgestellt. Nutze es als Orientierung für Stil und Struktur, aber passe den Inhalt an den konkreten Job an:\n${params.offerTemplate}`;
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
