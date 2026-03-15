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
  {
    name: "list_confirmed_dates",
    description:
      "List the user's saved confirmed dates. Returns slim data (id, title, date, category) for upcoming dates by default. Use get_item_details to see full info on a specific item.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Filter by category: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday",
        },
        include_past: {
          type: "boolean",
          description: "Include past dates (default: false)",
        },
        limit: {
          type: "number",
          description: "Max items to return (default: 25)",
        },
        offset: {
          type: "number",
          description: "Skip this many items for pagination",
        },
      },
      required: [],
    },
  },
  {
    name: "list_watchlist_items",
    description:
      "List the user's watchlist items. Returns slim data (id, title, category, status) for active items by default. Use get_item_details to see full info on a specific item.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Filter by category: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday",
        },
        status: {
          type: "string",
          enum: ["active", "resolved", "removed"],
          description: "Filter by status (default: active)",
        },
        limit: {
          type: "number",
          description: "Max items to return (default: 25)",
        },
        offset: {
          type: "number",
          description: "Skip this many items for pagination",
        },
      },
      required: [],
    },
  },
  {
    name: "get_item_details",
    description:
      "Get full details for a specific confirmed date or watchlist item by ID. Use after listing to examine a particular item.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          enum: ["confirmed_dates", "watchlist_items"],
          description: "Which table to look up",
        },
        id: {
          type: "string",
          description: "The item ID (from list results)",
        },
      },
      required: ["table", "id"],
    },
  },
  {
    name: "update_confirmed_date",
    description:
      "Update an existing confirmed date by ID. Only provide the fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The confirmed date ID (from list results)",
        },
        title: {
          type: "string",
          description: "New title for the event",
        },
        date: {
          type: "string",
          description: "New date in YYYY-MM-DD format",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "New confidence level",
        },
        source: {
          type: "string",
          description: "New source URL",
        },
        notes: {
          type: "string",
          description: "New notes",
        },
        category: {
          type: "string",
          description: "New category",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_watchlist_item",
    description:
      "Update an existing watchlist item by ID. Only provide the fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The watchlist item ID (from list results)",
        },
        title: {
          type: "string",
          description: "New title for the item",
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
          description: "New event type",
        },
        category: {
          type: "string",
          description: "New category",
        },
        notes: {
          type: "string",
          description: "New notes",
        },
        status: {
          type: "string",
          enum: ["active", "resolved", "removed"],
          description: "New status",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_confirmed_date",
    description:
      "Permanently delete a confirmed date by ID. Always confirm with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The confirmed date ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_watchlist_item",
    description:
      "Permanently delete a watchlist item by ID. Always confirm with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The watchlist item ID to delete",
        },
      },
      required: ["id"],
    },
  },
];
