#!/usr/bin/env node
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });
import { Command } from "commander";
import { authCommand } from "./commands/auth.js";
import { dateCommand } from "./commands/date.js";
import { watchlistCommand } from "./commands/watchlist.js";
const program = new Command()
    .name("goldfish")
    .version("1.0.0")
    .description("CLI for submitting confirmed dates to Supabase");
program.addCommand(authCommand);
program.addCommand(dateCommand);
program.addCommand(watchlistCommand);
program.parseAsync();
