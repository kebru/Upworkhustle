/**
 * Regression-Test: Upwork Feed HTML -> extractUpworkFeedTiles
 *
 * Run:
 *   npx tsx scripts/test-upwork-feed-extract.ts
 */
import fs from "fs";
import path from "path";
import { extractUpworkFeedTiles } from "../lib/extractUpworkFeedTiles";

const fixturePath = path.join(process.cwd(), "upwork_jobs.html");
const html = fs.readFileSync(fixturePath, "utf8");

const tiles = extractUpworkFeedTiles(html);
if (!tiles || tiles.length === 0) {
  console.error("FEHLER: Keine Tiles extrahiert.");
  process.exit(1);
}

console.log(`OK: tiles=${tiles.length}`);
console.log(`FirstTitle: ${tiles[0].title}`);
console.log(`FirstFeedHasMoreToggle: ${tiles[0].feedHasMoreToggle}`);
console.log(`FirstLikelyTruncated: ${tiles[0].likelyTruncated}`);
console.log(`FirstDescChars: ${tiles[0].descriptionCharLength}`);
console.log(`FirstDescPreview: ${tiles[0].description.slice(0, 200)}…`);

