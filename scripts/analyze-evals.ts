/**
 * Simple quality metrics over logs/evaluations.jsonl
 *
 * Run:
 *   npx tsx scripts/analyze-evals.ts
 */
import fs from "fs";
import path from "path";

type Rec = {
  outputVersion?: "v1" | "v2";
  model?: string;
  quality?: { winnerLatencyMs?: number; isGerman?: boolean };
  output?: any;
};

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
}

async function main() {
  const logPath = path.join(process.cwd(), "logs", "evaluations.jsonl");
  if (!fs.existsSync(logPath)) {
    console.error("No logs/evaluations.jsonl found.");
    process.exit(1);
  }

  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
  const recs: Rec[] = [];
  for (const line of lines) {
    try {
      recs.push(JSON.parse(line) as Rec);
    } catch {
      // ignore malformed
    }
  }

  const v2 = recs.filter((r) => r.outputVersion === "v2");
  const german = recs.filter((r) => r.quality?.isGerman === true);
  const lat = recs
    .map((r) => r.quality?.winnerLatencyMs)
    .filter((n): n is number => typeof n === "number");

  const buildYes = v2.filter((r) => r.output?.viable_build_20h === true).length;
  const consultYes = v2.filter((r) => r.output?.viable_consulting === true).length;

  console.log(`records=${recs.length}`);
  console.log(`v2=${v2.length}`);
  console.log(`german=${german.length}/${recs.length}`);
  console.log(`medianWinnerLatencyMs=${median(lat) ?? "n/a"}`);
  console.log(`v2 viable_build_20h true=${buildYes}/${v2.length}`);
  console.log(`v2 viable_consulting true=${consultYes}/${v2.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

