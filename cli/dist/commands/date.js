import { Command } from "commander";
import { readFileSync } from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { getSupabaseClient } from "../lib/supabase.js";
const VALID_CONFIDENCE = ["high", "medium", "low"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validateEntry(entry, index) {
    const prefix = index !== undefined ? `Entry ${index + 1}: ` : "";
    if (!entry.title)
        return `${prefix}--title is required`;
    if (!entry.date)
        return `${prefix}--date is required`;
    if (!DATE_RE.test(entry.date))
        return `${prefix}Invalid date format "${entry.date}". Use YYYY-MM-DD.`;
    if (!entry.confidence)
        return `${prefix}--confidence is required`;
    if (!VALID_CONFIDENCE.includes(entry.confidence))
        return `${prefix}Invalid confidence "${entry.confidence}". Use: high, medium, low.`;
    return null;
}
async function requireAuth() {
    const supabase = getSupabaseClient();
    const { data: { session }, error, } = await supabase.auth.getSession();
    if (error || !session) {
        console.error("Not logged in. Run: goldfish auth login");
        process.exit(1);
    }
    return { supabase, userId: session.user.id };
}
export const dateCommand = new Command("date").description("Manage confirmed dates");
dateCommand
    .command("add")
    .description("Add a single confirmed date")
    .requiredOption("--title <text>", "Title of the date entry")
    .requiredOption("--date <YYYY-MM-DD>", "The date value")
    .requiredOption("--confidence <level>", "high, medium, or low")
    .option("--source <text>", "Where this date came from")
    .option("--notes <text>", "Additional notes")
    .option("--id <text>", "Custom ID (auto-generated if omitted)")
    .option("--category <text>", "Category (e.g. tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday)")
    .action(async (opts) => {
    const validationError = validateEntry(opts);
    if (validationError) {
        console.error(validationError);
        process.exit(1);
    }
    const { supabase, userId } = await requireAuth();
    const id = opts.id || uuidv4();
    const { error } = await supabase.from("confirmed_dates").insert({
        id,
        user_id: userId,
        title: opts.title,
        date: opts.date,
        confidence: opts.confidence,
        source: opts.source ?? null,
        notes: opts.notes ?? null,
        category: opts.category?.toLowerCase() ?? null,
    });
    if (error) {
        console.error(`Failed to add date: ${error.message}`);
        process.exit(1);
    }
    console.log(`Added: ${id}`);
});
dateCommand
    .command("add-batch")
    .description("Add multiple confirmed dates from a JSON file")
    .requiredOption("--file <path>", "Path to JSON file containing date entries")
    .option("--group-id <text>", "Shared group_id for all entries (auto-generated if omitted)")
    .action(async (opts) => {
    let entries;
    try {
        const raw = readFileSync(opts.file, "utf-8");
        entries = JSON.parse(raw);
    }
    catch (err) {
        console.error(`Failed to read file: ${err.message}`);
        process.exit(1);
    }
    if (!Array.isArray(entries) || entries.length === 0) {
        console.error("File must contain a non-empty JSON array.");
        process.exit(1);
    }
    for (let i = 0; i < entries.length; i++) {
        const validationError = validateEntry(entries[i], i);
        if (validationError) {
            console.error(validationError);
            process.exit(1);
        }
    }
    const { supabase, userId } = await requireAuth();
    const groupId = opts.groupId || uuidv4();
    const rows = entries.map((entry, i) => ({
        id: entry.id || uuidv4(),
        user_id: userId,
        title: entry.title,
        date: entry.date,
        confidence: entry.confidence,
        source: entry.source ?? null,
        notes: entry.notes ?? null,
        category: entry.category?.toLowerCase() ?? null,
        group_id: groupId,
        group_index: i,
    }));
    const { error } = await supabase.from("confirmed_dates").insert(rows);
    if (error) {
        console.error(`Batch insert failed: ${error.message}`);
        process.exit(1);
    }
    console.log(`Added ${rows.length} dates (group: ${groupId})`);
});
