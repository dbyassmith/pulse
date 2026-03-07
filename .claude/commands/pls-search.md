Search the web to find a confirmed date for the following event, then add it to Goldfish.

**Event description:** $ARGUMENTS

## Instructions

1. **Search for the date.** Use WebSearch to find a confirmed date for this event. Try specific queries first (e.g., "WWDC 2026 date"), then broaden if needed. Prefer official sources over aggregators.

2. **Evaluate what you found.** Determine:
   - The **event title** (clean, human-readable name)
   - The **confirmed date** in YYYY-MM-DD format
   - The **source URL** where you found it
   - The **confidence level** based on source authority:
     - `high` — official/first-party source (company website, official social account, press release)
     - `medium` — reputable press (major tech publications, established news outlets)
     - `low` — rumors, leaks, forums, unnamed sources
   - The **category** — one of: `tech`, `sports`, `entertainment`, `gaming`, `birthday`, `travel`, `personal`, `business`, `holiday` (or a new short, lowercase, single-word category if none fit)
   - Brief **notes** summarizing what you found and why you trust (or don't trust) the source

3. **Report your findings.** Before running any command, tell me:
   - What event you found
   - The date and where it came from
   - Your confidence assessment and why

4. **If no confirmed date can be found**, do NOT run the `goldfish date add` command. Instead, create a watchlist item for ongoing monitoring:

   a. Tell the user: "No confirmed date found yet for [event]."

   b. Infer watchlist fields from the event description:
      - **title** — Clean, human-readable event name
      - **id** — Slugified title (lowercase, hyphens, no special chars)
      - **type** — One of: `one-time`, `recurring-irregular`, `recurring-predictable`, `series`, `category-watch`
      - **category** — One of: `tech`, `sports`, `entertainment`, `gaming`, `birthday`, `travel`, `personal`, `business`, `holiday` (or a new short, lowercase, single-word category if none fit)
      - **search_queries** — 2-4 refined web search queries (improve on what was already tried)
      - **confirmed_when** — Plain English criteria for what counts as a confirmed date
      - **confidence_threshold** — Default to `medium`

   c. Check if `agent/watchlist/<id>.md` already exists. If it does, tell the user: "This event is already on your watchlist." and stop.

   d. Write the watchlist file to `agent/watchlist/<id>.md`:

      ```yaml
      ---
      title: "<title>"
      id: "<id>"
      type: <type>
      category: <category>
      added: <today's date YYYY-MM-DD>
      confidence_threshold: <confidence_threshold>
      search_queries:
        - "<query 1>"
        - "<query 2>"
        - "<query 3 if useful>"
      confirmed_when: >
        <Plain English description of what constitutes a confirmed date>
      ---
      ```

   e. Confirm to the user:
      - What watchlist item was created and where
      - That `/pls-run` will automatically check for this date on future runs

5. **If a date is confirmed**, run this command:

   ```bash
   goldfish date add \
     --id "<slugified-title>" \
     --title "<event title>" \
     --date "<YYYY-MM-DD>" \
     --confidence "<high|medium|low>" \
     --source "<source-url>" \
     --notes "<brief summary of findings>" \
     --category "<category>"
   ```

   **ID rules:** Take the title, lowercase it, replace spaces and special characters with hyphens, strip trailing hyphens. Examples: "WWDC 2026" → `wwdc-2026`, "iPhone 17 Launch" → `iphone-17-launch`.

   **Quote all flag values** that contain spaces.
