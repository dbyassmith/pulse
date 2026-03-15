Run the full Goldfish agent workflow: search for confirmed dates and requeue resolved events.

## Context

Read `agent/CLAUDE.md` for full workflow documentation, event types, confidence model, and CLI reference before proceeding.

## Instructions

Execute two passes, then write a log summary.

---

### Pass 1: Research

Read all `.md` files in `agent/watchlist/`. For each file:

1. **Parse the YAML frontmatter** to extract: title, id, type, category, confidence_threshold, search_queries, confirmed_when.

2. **Search the web** using WebSearch for each query in `search_queries`. Try them in order. If the first query gives a strong result, you can skip remaining queries.

3. **Evaluate the results** against the `confirmed_when` criteria:
   - Does a search result confirm a **specific date** (day, not just month)?
   - What is the **source authority**?
     - `high` — official/first-party (company website, official blog, press release)
     - `medium` — reputable press (The Verge, TechCrunch, Bloomberg, Reuters)
     - `low` — rumors, leaks, forums, unnamed sources
   - Is the date clearly confirmed, or speculative ("expected", "rumored", "likely")?

4. **Decision: resolve or skip**

   **Resolve if:**
   - A specific date (YYYY-MM-DD) was found
   - The source confidence **meets or exceeds** the item's `confidence_threshold`
   - The `confirmed_when` criteria are satisfied

   **Do NOT resolve if:**
   - Only a month is mentioned (no specific day)
   - The date is speculative or rumored and confidence < threshold
   - The event appears cancelled
   - No relevant results were found

5. **If resolving:**
   - Report to the user: event name, confirmed date, source URL, confidence level
   - Run the CLI command:
     ```bash
     goldfish date add \
       --id "<id>" \
       --title "<title>" \
       --date "<YYYY-MM-DD>" \
       --confidence "<high|medium|low>" \
       --source "<source-url>" \
       --notes "<brief summary of what was found>" \
       --category "<category>" \
       --subcategory "<subcategory if obvious>"
     ```
   - Read the current watchlist file, add resolution metadata to the frontmatter:
     ```yaml
     resolved_date: "YYYY-MM-DD"
     resolved_on: "<today YYYY-MM-DD>"
     resolved_confidence: "<high|medium|low>"
     resolved_source: "<source-url>"
     ```
   - Move the file from `agent/watchlist/<id>.md` to `agent/resolved/confirmed/<id>.md`
   - **If type is `category-watch`:** immediately spawn a fresh watchlist entry (same category, new search queries for the next occurrence) in `agent/watchlist/`

6. **If not resolving:**
   - Log what was found (or "no results") — this goes into the run summary
   - Leave the file in `agent/watchlist/`
   - Optionally update `last_checked` in the file's frontmatter to today's date
   - If you updated `last_checked`, you MUST immediately run `goldfish watchlist sync --file agent/watchlist/<id>.md` to sync the updated frontmatter to the database

7. **If search fails** (network error, no results at all):
   - Log the error
   - Continue to the next item

---

### Pass 2: Requeue

Read all `.md` files in `agent/resolved/confirmed/`. For each file:

1. **Parse the frontmatter** — get `type`, `resolved_date`, `id`, `title`, `category`, `search_queries`, `confirmed_when`.

2. **Check if the resolved date has passed** (compare to today's date).
   - If the date has NOT passed: skip this item.
   - If the date HAS passed: act based on type.

3. **Requeue by type:**

   **one-time:** No action. The file stays in `resolved/confirmed/` as an archive.

   **recurring-irregular:**
   - Increment the year in `title` and `id` (e.g., "WWDC 2026" -> "WWDC 2027", `wwdc-2026` -> `wwdc-2027`)
   - Update `search_queries` to reference the new year
   - Update `confirmed_when` if it references a specific year
   - Set `parent_id` to the current item's `id`
   - Set `added` to today's date
   - Remove resolution metadata (`resolved_date`, `resolved_on`, `resolved_confidence`, `resolved_source`)
   - Write the new file to `agent/watchlist/<new-id>.md`
   - You MUST immediately run `goldfish watchlist sync --file agent/watchlist/<new-id>.md` after writing the requeued file

   **recurring-predictable:**
   - Same as recurring-irregular
   - Also include `date_estimate` based on the known pattern
   - You MUST immediately run `goldfish watchlist sync --file agent/watchlist/<new-id>.md` after writing the requeued file

   **series:**
   - Determine the next event in the series
   - Create a new watchlist entry with updated title, id, and search queries
   - Set `parent_id` to the current item's `id`
   - Write to `agent/watchlist/<new-id>.md`
   - You MUST immediately run `goldfish watchlist sync --file agent/watchlist/<new-id>.md` after writing the requeued file

   **category-watch:** Skip — these are requeued during Pass 1 at resolution time, not here.

---

### Logging

After both passes, write a summary to `agent/logs/<YYYY-MM-DD-HHMMSS>.md` using this format:

```markdown
# Agent Run: <YYYY-MM-DD HH:MM:SS>

## Research Pass
- **<id>**: <what was searched>. <what was found>. Confidence: <level>. <RESOLVED or Left in watchlist>.
- **<id>**: <what was searched>. <what was found or "No results">. <Left in watchlist>.

## Requeue Pass
- **<id>**: Date passed (<date>). Type: <type>. <Action taken or "Archived (one-time)">.

## Summary
- Items searched: <N>
- Resolved: <N>
- Left in place: <N>
- Requeued: <N>
```

If the watchlist was empty, write: "No items in watchlist. Nothing to search."
If resolved folder was empty or no dates passed, write: "No items to requeue."

---

### Final Sync Sweep

As a final safety net, run `goldfish watchlist sync --dir agent/watchlist/` to ensure all items are synced to the database. This catches any files that may have been written or updated without an individual sync call.

---

### Final Report

After writing the log, give the user a brief summary of what happened:
- How many items were searched
- What was resolved (with dates and sources)
- What was left in the watchlist and why
- What was requeued
- Path to the full log file
