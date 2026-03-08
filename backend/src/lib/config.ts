import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, "../../.env") });

export function getConfig() {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const braveApiKey = process.env.BRAVE_API_KEY;

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  }

  if (!braveApiKey) {
    throw new Error("BRAVE_API_KEY environment variable is not set.");
  }

  return { anthropicApiKey, braveApiKey };
}
