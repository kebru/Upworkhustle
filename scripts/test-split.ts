/**
 * Diagnose: splitJobPostings – Ausgabe nach stdout + split-debug.log
 * Aufruf: npx tsx scripts/test-split.ts
 */
import * as fs from "fs";
import * as path from "path";
import { splitJobPostings } from "../lib/splitJobs";

const logPath = path.join(process.cwd(), "split-debug.log");

const lines: string[] = [];
function log(msg: string) {
  lines.push(msg);
  console.log(msg);
}

const htmlFeed = `<div class="feed">
<div>Ordered by most relevant.</div>
<div><span>Posted</span> <span>yesterday</span></div>
<div>AI Sales Dashboard</div>
<div>Hourly: $35</div>
<div><span>Posted</span> <span>yesterday</span></div>
<div>Build Prompt Builder</div>
<div>Fixed-price</div>
</div>`;

const plainFeed = `nav text
Posted yesterday
Job A title
Hourly: $10
Posted 4 hours ago
Job B title
Fixed-price`;

log("=== split-debug " + new Date().toISOString() + " ===\n");

log("1) HTML: Posted/yesterday in getrennten Tags");
const a = splitJobPostings(htmlFeed);
log(`   parts=${a.length} (erwartet >= 2)`);
a.forEach((p, i) => log(`   [${i}] ${p.slice(0, 80).replace(/\n/g, " ")}…`));

log("\n2) Klartext-Feed");
const b = splitJobPostings(plainFeed);
log(`   parts=${b.length} (erwartet 2)`);

log("\n3) Falscher manueller Trenner ___ (soll NICHT in zwei Teile brechen)");
const c = splitJobPostings(`___
Skip
Posted yesterday
X
Hourly: 1
Posted yesterday
Y
Hourly: 2`);
log(`   parts=${c.length} (erwartet 2, nicht 1 durch ___-Split)`);

log("\n4) Echter manueller --- zwischen zwei Jobs");
const d = splitJobPostings(`Posted yesterday
A
Hourly: 1

---

Posted yesterday
B
Hourly: 2`);
log(`   parts=${d.length} (erwartet 2)`);

fs.writeFileSync(logPath, lines.join("\n"), "utf8");
log(`\nGeschrieben: ${logPath}`);

const ok = a.length >= 2 && b.length === 2 && c.length === 2 && d.length === 2;
if (!ok) {
  console.error("\nFEHLER: Erwartungen nicht erfüllt.");
  process.exit(1);
}
