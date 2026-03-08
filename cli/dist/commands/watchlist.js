import { Command } from "commander";
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { v4 as uuidv4 } from "uuid";
import matter from "gray-matter";
import { getSupabaseClient } from "../lib/supabase.js";
const VALID_TYPES = [
    "one-time",
    "recurring-irregular",
    "recurring-predictable",
    "series",
    "category-watch",
];
const VALID_CONFIDENCE = ["high", "medium", "low"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
async function requireAuth() {
    const supabase = getSupabaseClient();
    const { data: { session }, error, } = await supabase.auth.getSession();
    if (error || !session) {
        console.error("Not logged in. Run: goldfish auth login");
        process.exit(1);
    }
    return { supabase, userId: session.user.id };
}
function parseWatchlistFile(filePath) {
    if (extname(filePath) !== ".md") {
        throw new Error(`Not a markdown file: ${filePath}`);
    }
    const raw = readFileSync(filePath, "utf-8");
    const { data } = matter(raw);
    if (!data.id || typeof data.id !== "string") {
        throw new Error(`Missing or invalid "id" in frontmatter: ${filePath}`);
    }
    if (!data.title || typeof data.title !== "string") {
        throw new Error(`Missing or invalid "title" in frontmatter: ${filePath}`);
    }
    const type = data.type || "one-time";
    if (!VALID_TYPES.includes(type)) {
        throw new Error(`Invalid type "${type}" in ${filePath}. Use: ${VALID_TYPES.join(", ")}`);
    }
    return {
        id: data.id,
        title: data.title,
        type: type,
        category: typeof data.category === "string" ? data.category.toLowerCase() : null,
        notes: typeof data.notes === "string" ? data.notes : null,
        added: data.added ? new Date(data.added).toISOString() : new Date().toISOString(),
    };
}
async function syncFile(filePath, supabase, userId) {
    const fields = parseWatchlistFile(filePath);
    const { error } = await supabase.from("watchlist_items").upsert({
        id: fields.id,
        user_id: userId,
        title: fields.title,
        type: fields.type,
        category: fields.category,
        notes: fields.notes,
        added: fields.added,
        status: "active",
        updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,id" });
    if (error) {
        throw new Error(`Failed to sync "${fields.title}": ${error.message}`);
    }
    return fields;
}
export const watchlistCommand = new Command("watchlist").description("Manage watchlist items");
// --- sync ---
const syncCommand = new Command("sync").description("Sync watchlist files to the database");
syncCommand
    .command("file")
    .description("Sync a single watchlist markdown file")
    .argument("<path>", "Path to the .md file")
    .action(async (filePath) => {
    const { supabase, userId } = await requireAuth();
    try {
        const fields = await syncFile(filePath, supabase, userId);
        console.log(`Synced: ${fields.title} (${fields.id})`);
    }
    catch (err) {
        console.error(err.message);
        process.exit(1);
    }
});
syncCommand
    .command("dir")
    .description("Sync all markdown files in a directory")
    .argument("<path>", "Path to the directory")
    .action(async (dirPath) => {
    const { supabase, userId } = await requireAuth();
    let files;
    try {
        files = readdirSync(dirPath)
            .filter((f) => f.endsWith(".md") && f !== ".gitkeep");
    }
    catch (err) {
        console.error(`Failed to read directory: ${err.message}`);
        process.exit(1);
    }
    if (files.length === 0) {
        console.log("No markdown files found.");
        return;
    }
    let synced = 0;
    let failed = 0;
    for (const file of files) {
        try {
            const fields = await syncFile(join(dirPath, file), supabase, userId);
            console.log(`Synced: ${fields.title} (${fields.id})`);
            synced++;
        }
        catch (err) {
            console.warn(`Warning: ${err.message}`);
            failed++;
        }
    }
    console.log(`\nDone: ${synced} synced, ${failed} failed`);
});
watchlistCommand.addCommand(syncCommand);
// --- resolve ---
watchlistCommand
    .command("resolve")
    .description("Resolve a watchlist item and add a confirmed date")
    .requiredOption("--id <text>", "Watchlist item ID")
    .requiredOption("--date <YYYY-MM-DD>", "The confirmed date")
    .requiredOption("--confidence <level>", "high, medium, or low")
    .option("--source <text>", "Source URL")
    .option("--notes <text>", "Additional notes")
    .option("--category <text>", "Category")
    .action(async (opts) => {
    // Validate date
    if (!DATE_RE.test(opts.date)) {
        console.error(`Invalid date format "${opts.date}". Use YYYY-MM-DD.`);
        process.exit(1);
    }
    // Validate confidence
    if (!VALID_CONFIDENCE.includes(opts.confidence)) {
        console.error(`Invalid confidence "${opts.confidence}". Use: high, medium, low.`);
        process.exit(1);
    }
    const { supabase, userId } = await requireAuth();
    // Step 1: Insert into confirmed_dates (higher-value write)
    const dateId = uuidv4();
    const { error: dateError } = await supabase.from("confirmed_dates").upsert({
        id: dateId,
        user_id: userId,
        title: opts.id, // Will be overwritten below if we can fetch the title
        date: opts.date,
        confidence: opts.confidence,
        source: opts.source ?? null,
        notes: opts.notes ?? null,
        category: opts.category?.toLowerCase() ?? null,
    }, { onConflict: "id" });
    if (dateError) {
        console.error(`Failed to add confirmed date: ${dateError.message}`);
        process.exit(1);
    }
    // Step 2: Update watchlist_items status (lower-priority write)
    const { data: watchlistItem, error: updateError } = await supabase
        .from("watchlist_items")
        .update({
        status: "resolved",
        updated_at: new Date().toISOString(),
    })
        .eq("id", opts.id)
        .eq("user_id", userId)
        .select("title")
        .single();
    if (updateError) {
        console.warn(`Warning: Date saved but watchlist update failed: ${updateError.message}`);
        console.warn("Re-run 'goldfish watchlist sync file <path>' to repair.");
    }
    const title = watchlistItem?.title || opts.id;
    // Update the confirmed_dates title if we got it from watchlist
    if (watchlistItem?.title) {
        await supabase
            .from("confirmed_dates")
            .update({ title: watchlistItem.title })
            .eq("id", dateId);
    }
    console.log(`Resolved: ${title} → ${opts.date}`);
});
// --- remove ---
watchlistCommand
    .command("remove")
    .description("Soft-delete a watchlist item")
    .requiredOption("--id <text>", "Watchlist item ID")
    .action(async (opts) => {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase
        .from("watchlist_items")
        .update({
        status: "removed",
        updated_at: new Date().toISOString(),
    })
        .eq("id", opts.id)
        .eq("user_id", userId)
        .select("title")
        .single();
    if (error) {
        console.error(`Failed to remove: ${error.message}`);
        process.exit(1);
    }
    console.log(`Removed: ${data.title}`);
});
