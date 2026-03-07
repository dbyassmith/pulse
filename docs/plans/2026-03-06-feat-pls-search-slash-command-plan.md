---
title: "feat: Add pls-search slash command for web-based date lookup"
type: feat
status: completed
date: 2026-03-06
---

# Add pls-search slash command for web-based date lookup

Create a Claude Code slash command at `.claude/commands/pls-search.md` that takes a plain English event description, searches the web for a confirmed date, and calls `pulse date add` with the result.

## Acceptance Criteria

- [x] `.claude/commands/pls-search.md` exists and is invocable via `/pls-search` in Claude Code
- [x] Command accepts `$ARGUMENTS` as the user's plain English event description
- [x] Instructs Claude to use `WebSearch` to find a confirmed date for the described event
- [x] Reports what was found: event name, date, source URL, and confidence assessment
- [x] Calls `pulse date add` with all required flags:
  - `--id` — slugified version of the title (e.g., `wwdc-2026`)
  - `--title` — human-readable event title
  - `--date` — in `YYYY-MM-DD` format
  - `--confidence` — `high` for official sources (e.g., apple.com), `medium` for reputable press (e.g., The Verge), `low` for rumors/leaks
  - `--source` — the URL where the date was found
  - `--notes` — brief context on what was found and how confident the source is
- [x] Handles ambiguity gracefully: if no confirmed date is found, reports that instead of guessing

## Context

### CLI interface (from `cli/src/commands/date.ts`)

```
pulse date add \
  --id <text>           # Custom ID (auto-generated UUID if omitted)
  --title <text>        # Required: title of the date entry
  --date <YYYY-MM-DD>   # Required: the date value
  --confidence <level>  # Required: high | medium | low
  --source <text>       # Optional: where this date came from
  --notes <text>        # Optional: additional notes
```

The CLI is a Node.js app at `cli/dist/index.js` (bin: `pulse`). It requires auth via `pulse auth login` before use.

### Slash command structure

Claude Code slash commands are markdown files in `.claude/commands/`. The file content is a prompt template. User arguments are available via `$ARGUMENTS`.

### Confidence mapping

| Source type | Confidence | Examples |
|---|---|---|
| Official / first-party | `high` | Company websites, official social accounts, press releases |
| Reputable press | `medium` | Major tech publications, established news outlets |
| Rumors / leaks / forums | `low` | Reddit, Twitter leaks, unnamed sources |

### ID generation

The `--id` should be a URL-safe slug derived from the title:
- Lowercase
- Spaces and special characters replaced with hyphens
- Trailing hyphens stripped
- Example: "WWDC 2026" -> `wwdc-2026`, "iPhone 17 Launch" -> `iphone-17-launch`

## MVP

### .claude/commands/pls-search.md

The slash command file should be a prompt template that instructs Claude to:

1. Parse `$ARGUMENTS` as a plain English event description
2. Use `WebSearch` to find the confirmed date (try multiple queries if needed)
3. Evaluate source authority and assign confidence
4. Report findings to the user (event, date, source URL, confidence rationale)
5. Run `pulse date add` via Bash with all flags populated
6. If no date can be confirmed, tell the user and do not run the command

Key behaviors to encode in the prompt:
- Try the most specific search first, then broaden if needed
- Prefer official sources over aggregator sites
- Always show the user what was found before running the command
- Slugify the title for `--id` (lowercase, hyphens, no special chars)
- Quote flag values that contain spaces

## Sources

- CLI source: `cli/src/commands/date.ts`
- Claude Code slash command docs: commands are `.md` files in `.claude/commands/`, `$ARGUMENTS` contains user input
