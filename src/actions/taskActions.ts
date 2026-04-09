import { action } from "@solidjs/router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { getRequestEvent } from "solid-js/web";
import { z } from "zod";
import {
  buildRateLimitBucketKey,
  consumeRateLimit,
  type RateLimitPolicy,
} from "~/lib/requestSecurity";
import type { BreakdownGranularity } from "~/stores/preferencesStore";

const openai = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const createTasksSchema = z.object({
  title: z.string().describe("The title of the task list"),
  tasks: z.array(
    z.object({
      content: z.string().describe("The task description"),
      dueDate: z.string().optional().describe("ISO date string if a specific deadline is mentioned"),
    })
  ),
});

const askClarificationSchema = z.object({
  question: z.string().describe("The clarifying question to ask the user"),
});

type CreateTasksResult = {
  ok: true;
  action: "createTasks";
} & z.infer<typeof createTasksSchema>;

type AskClarificationResult = {
  ok: true;
  action: "askClarification";
} & z.infer<typeof askClarificationSchema>;

export type BreakdownTaskResult = CreateTasksResult | AskClarificationResult;

const readFormString = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

const normalizeGranularity = (value: string): BreakdownGranularity => {
  if (value === "low" || value === "high") {
    return value;
  }

  return "medium";
};

type ToolCallPayload = {
  toolName?: unknown;
  input?: unknown;
};

const AI_RATE_LIMIT_POLICIES: readonly RateLimitPolicy[] = [
  {
    id: "ai-breakdown-1m",
    maxRequests: 5,
    windowMs: 60_000,
  },
  {
    id: "ai-breakdown-1h",
    maxRequests: 30,
    windowMs: 60 * 60_000,
  },
];

export const consumeAiBreakdownRateLimit = (request: Request, clientAddress?: string) =>
  consumeRateLimit(
    buildRateLimitBucketKey(request, "ai-breakdown", clientAddress),
    AI_RATE_LIMIT_POLICIES,
  );

export const breakdownTask = action(async (data: FormData) => {
  "use server";
  const requestEvent = getRequestEvent();
  const request = requestEvent?.request;
  if (!request) {
    throw new Error("Missing request context for task breakdown");
  }

  const rateLimitResult = consumeAiBreakdownRateLimit(request, requestEvent.clientAddress);
  if (!rateLimitResult.allowed) {
    throw new Error("Too many AI breakdown requests. Please wait a minute and try again.");
  }

  const task = readFormString(data.get("task"));
  const granularity = normalizeGranularity(readFormString(data.get("granularity")));
  const clarification = readFormString(data.get("clarification")) || null;
  const hasClarification = !!clarification;

  let granularityInstruction = "Break tasks into standard, manageable chunks.";
  if (granularity === "low") granularityInstruction = "Keep tasks high-level and broad. Do not over-fragment.";
  if (granularity === "high") granularityInstruction = "Break tasks into very small, atomic, micro-steps. Be extremely detailed.";

  const prompt = hasClarification
    ? `Original task:\n${task}\n\nAdditional clarification:\n${clarification}`
    : task;

  const { steps } = await generateText({
    model: openai("gemini-2.5-flash-lite"),
    prompt,
    system: `
You are an expert task decomposer for neurodivergent users.

RULES:
1. ${granularityInstruction}
2. DETECT LANGUAGE: Output tasks in the SAME language as the user's prompt.
${
  // 3. Only inject this rule if the tool is actually available
  !hasClarification 
    ? `3. If the user's request is too vague (e.g., "work", "project"), use the 'askClarification' tool.` 
    : ""
}
4. If the request is actionable, use the 'createTasks' tool immediately.
5. Do not be chatty. Only use tools.
`,
    tools: {
      createTasks: tool({
        description: "Create a list of tasks from the prompt",
        inputSchema: createTasksSchema,
      }),
      ...(!hasClarification &&
        {askClarification: tool({
          description: "Ask the user for more details if the prompt is too vague",
          inputSchema: askClarificationSchema,
        }),
        })
    },
  });

  const lastToolCall = steps[steps.length - 1]?.content[0] as ToolCallPayload | undefined;

  if (lastToolCall?.toolName === "createTasks") {
    return {
      ok: true,
      action: "createTasks",
      ...createTasksSchema.parse(lastToolCall.input),
    };
  }

  if (lastToolCall?.toolName === "askClarification") {
    return {
      ok: true,
      action: "askClarification",
      ...askClarificationSchema.parse(lastToolCall.input),
    };
  }

  throw new Error("AI response did not produce a supported tool call");
}, "task");
