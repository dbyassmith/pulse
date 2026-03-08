import type Anthropic from "@anthropic-ai/sdk";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "search_for_date",
    description:
      "Search the web for a confirmed date for an event. Returns whether a date was found, the date itself, confidence level, source URL, and notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            'The search query describing the event to find a date for. E.g. "NFL Draft 2026 date" or "WWDC 2026 dates"',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_confirmed_date",
    description:
      "Save a confirmed date to the user's Goldfish account. Use this after finding a date with high or medium confidence.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Human-readable event name. E.g. \"NFL Draft 2026\"",
        },
        date: {
          type: "string",
          description: "The confirmed date in YYYY-MM-DD format",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Confidence level based on source authority",
        },
        source: {
          type: "string",
          description: "URL where the date was found",
        },
        notes: {
          type: "string",
          description: "Brief summary of findings",
        },
        category: {
          type: "string",
          description:
            "Event category: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday",
        },
      },
      required: ["title", "date", "confidence"],
    },
  },
  {
    name: "create_watchlist_item",
    description:
      "Add an event to the user's watchlist for ongoing monitoring. Use this when a date isn't confirmed yet so the background process can check periodically.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: 'Human-readable event name. E.g. "iPhone 17 Launch"',
        },
        type: {
          type: "string",
          enum: [
            "one-time",
            "recurring-irregular",
            "recurring-predictable",
            "series",
            "category-watch",
          ],
          description:
            "Event type. Use 'one-time' for most events, 'recurring-irregular' for annual events with varying dates",
        },
        category: {
          type: "string",
          description:
            "Event category: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday",
        },
        notes: {
          type: "string",
          description: "Additional context about the event",
        },
      },
      required: ["title", "type"],
    },
  },
];
