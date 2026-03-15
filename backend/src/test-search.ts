import { searchForDate } from "./search.js";
import { queryBraveAnswers } from "./brave-answers.js";

const query = process.argv[2] ?? "WWDC 2026";
const braveOnly = process.argv.includes("--brave-only");

console.log(`Searching for: "${query}"...\n`);

try {
  if (braveOnly) {
    const braveResult = await queryBraveAnswers(query);
    console.log("Brave Answer:", braveResult.answer);
    console.log("\nCitations:", JSON.stringify(braveResult.citations, null, 2));
  } else {
    const result = await searchForDate(query);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (err) {
  console.error("Error:", err instanceof Error ? err.message : err);
}
