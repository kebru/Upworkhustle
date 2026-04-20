/**
 * Quick local analysis run:
 * - reads upwork_jobs.html fixture
 * - POST /api/parse
 * - evaluates first 3 jobs via /api/evaluate
 *
 * Run:
 *   npx tsx scripts/run-sample-evals.ts
 */
import fs from "fs";
import path from "path";

type ParsedJob = {
  source: "upwork_feed" | "text";
  jobText: string;
  title?: string;
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  skills?: string[];
  feedHasMoreToggle?: boolean;
  likelyTruncated?: boolean;
  descriptionCharLength?: number;
  jobTextCharLength?: number;
  wasTrimmed?: boolean;
  jobUrl?: string;
};

async function main() {
  const baseUrl = process.env.BASE_URL?.trim() || "http://localhost:3001";
  const fixturePath = path.join(process.cwd(), "upwork_jobs.html");
  const rawText = fs.readFileSync(fixturePath, "utf8");

  const pres = await fetch(`${baseUrl}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
  const ptext = await pres.text();
  let pdata: { jobs?: ParsedJob[]; error?: string };
  try {
    pdata = JSON.parse(ptext) as { jobs?: ParsedJob[]; error?: string };
  } catch {
    throw new Error(
      `parse non-json response status=${pres.status} firstBytes=${JSON.stringify(ptext.slice(0, 120))}`,
    );
  }
  if (!pres.ok || !Array.isArray(pdata.jobs)) {
    throw new Error(
      `parse failed status=${pres.status} error=${pdata.error ?? "unknown"}`,
    );
  }

  const all = pdata.jobs;
  const byDescLen = [...all].sort(
    (a, b) => (a.descriptionCharLength ?? 0) - (b.descriptionCharLength ?? 0),
  );
  const byJobTextLen = [...all].sort(
    (a, b) => (a.jobTextCharLength ?? 0) - (b.jobTextCharLength ?? 0),
  );

  const likely = all.filter((j) => j.likelyTruncated);
  console.log(
    `parsed jobs=${all.length} | likelyTruncated=${likely.length} | feedHasMoreToggle=${all.filter((j) => j.feedHasMoreToggle).length}`,
  );
  console.log(
    `descChars min=${byDescLen[0]?.descriptionCharLength ?? "?"} max=${byDescLen.at(-1)?.descriptionCharLength ?? "?"}`,
  );
  console.log(
    `jobTextChars min=${byJobTextLen[0]?.jobTextCharLength ?? "?"} max=${byJobTextLen.at(-1)?.jobTextCharLength ?? "?"}`,
  );

  const picked: ParsedJob[] = [];
  const shortest = byDescLen[0];
  if (shortest) picked.push(shortest);

  const medium = byDescLen[Math.floor(byDescLen.length / 2)];
  if (medium && !picked.includes(medium)) picked.push(medium);

  const longest = byDescLen.at(-1);
  if (longest && !picked.includes(longest)) picked.push(longest);

  const firstLikely = likely[0];
  if (firstLikely && !picked.includes(firstLikely)) picked.splice(1, 0, firstLikely);

  const jobs = picked.slice(0, 3);
  console.log(`evaluating=${jobs.length}`);

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const res = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        async: true,
        jobText: j.jobText,
        meta: {
          source: j.source,
          feedHasMoreToggle: j.feedHasMoreToggle,
          likelyTruncated: j.likelyTruncated,
          descriptionCharLength: j.descriptionCharLength,
          jobTextCharLength: j.jobTextCharLength,
          wasTrimmed: j.wasTrimmed,
          title: j.title,
          jobUrl: j.jobUrl,
          postedOn: j.postedOn,
          jobType: j.jobType,
          budget: j.budget,
          duration: j.duration,
          contractorTier: j.contractorTier,
          skillsCount: j.skills?.length ?? 0,
        },
      }),
    });
    const startText = await res.text();
    let startData: any;
    try {
      startData = JSON.parse(startText);
    } catch {
      console.log(
        `\n#${i + 1} ERROR start non-json status=${res.status} title=${j.title ?? "(no title)"}\n${startText.slice(0, 400)}`,
      );
      continue;
    }
    if (!res.ok || typeof startData.jobId !== "string") {
      console.log(
        `\n#${i + 1} ERROR start status=${res.status} title=${j.title ?? "(no title)"}\n${startData?.error ?? "unknown error"}`,
      );
      continue;
    }
    const jobId: string = startData.jobId;

    const pollUntilDone = async (): Promise<any> => {
      const started = Date.now();
      const maxWaitMs = 120_000;
      while (Date.now() - started < maxWaitMs) {
        const pres = await fetch(
          `${baseUrl}/api/evaluate?jobId=${encodeURIComponent(jobId)}`,
        );
        const txt = await pres.text();
        let pdata: any;
        try {
          pdata = JSON.parse(txt);
        } catch {
          throw new Error(`poll non-json status=${pres.status}`);
        }
        if (!pres.ok) throw new Error(pdata?.error ?? "poll failed");
        if (pdata.status === "done") return pdata;
        if (pdata.status === "error") throw new Error(pdata?.error ?? "job error");
        await new Promise((r) => setTimeout(r, 800));
      }
      throw new Error("poll timeout");
    };

    let data: any;
    try {
      data = await pollUntilDone();
    } catch (e) {
      console.log(
        `\n#${i + 1} ERROR poll title=${j.title ?? "(no title)"}\n${String(e)}`,
      );
      continue;
    }

    console.log(
      `\n#${i + 1} ${j.title ?? "(no title)"}\n` +
        `flags: feedHasMoreToggle=${String(j.feedHasMoreToggle)} likelyTruncated=${String(j.likelyTruncated)} wasTrimmed=${String(j.wasTrimmed)}\n` +
        `lens: descChars=${j.descriptionCharLength ?? "?"} jobTextChars=${j.jobTextCharLength ?? "?"}\n` +
        `result: viable=${String(data.result?.viable)} overall=${String(data.result?.overall_score)} effort=${String(data.result?.effort_hours)}\n` +
        `criteria: scope=${String(data.result?.criteria?.scope_clarity)} ops=${String(data.result?.criteria?.low_integration_ops_complexity)} solo=${String(data.result?.criteria?.solo_delivery_fit)}\n` +
        `risks[0]: ${Array.isArray(data.result?.risks) ? String(data.result?.risks[0] ?? "") : ""}\n` +
        `next_steps[0]: ${Array.isArray(data.result?.next_steps) ? String(data.result?.next_steps[0] ?? "") : ""}`,
    );
  }

  // Show latest log quality flags (best-effort)
  try {
    const logPath = path.join(process.cwd(), "logs", "evaluations.jsonl");
    if (fs.existsSync(logPath)) {
      const lines = fs
        .readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .slice(-5);
      console.log("\n--- last logs (quality) ---");
      for (const line of lines) {
        const rec = JSON.parse(line) as any;
        const q = rec.quality;
        if (q) {
          console.log(
            `${rec.ts} model=${rec.model} winner=${q.winnerModel ?? rec.model} winMs=${q.winnerLatencyMs ?? "?"} loserAborted=${q.loserAborted ?? "?"} deadlineHit=${q.deadlineHit ?? "?"} repair=${q.usedRepair ?? "?"} german=${q.isGerman ?? "?"} empty=${q.emptyContentSeen ?? "?"} jsonFirst=${q.wasJsonValidFirstTry ?? "?"}`,
          );
        } else {
          console.log(`${rec.ts} model=${rec.model} (no quality)`);
        }
      }
    }
  } catch {
    // ignore
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

