import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { parseDay } from "@/lib/days";
import { loadJournal } from "@/lib/mcp/journal";

const INSTRUCTIONS =
  "daily-thoughts is a private journal. Each day has short thoughts (sent from " +
  "Telegram or the web page), a check-in where the owner answers a few " +
  "questions, and a sticker for the day's mood. Entries are tagged with " +
  "categories. Call get_data to read it all. Days are YYYY-MM-DD.";

function dayArg(name: string) {
  return z
    .string()
    .optional()
    .describe(`${name}, YYYY-MM-DD, inclusive. Leave out for no limit.`);
}

/** A fresh server per request: the endpoint is stateless. */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "daily-thoughts", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "get_data",
    {
      title: "Get journal data",
      description:
        "Everything in the journal, grouped by day (oldest first): each day's " +
        "thoughts with their time, the check-in questions as they were worded " +
        "that day with their answers, the day's sticker, and the categories " +
        "each entry was tagged with. Also returns every check-in question " +
        "(including retired ones) and the active categories. Optionally narrow " +
        "to a date range.",
      inputSchema: { from_date: dayArg("First day"), to_date: dayArg("Last day") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from_date, to_date }) => {
      for (const [name, value] of [["from_date", from_date], ["to_date", to_date]] as const) {
        if (value !== undefined && parseDay(value) === null) {
          return {
            isError: true,
            content: [{ type: "text", text: `${name} must be YYYY-MM-DD, got ${JSON.stringify(value)}.` }],
          };
        }
      }
      const journal = await loadJournal(from_date ?? null, to_date ?? null);
      return { content: [{ type: "text", text: JSON.stringify(journal) }] };
    },
  );

  return server;
}
