import { action } from "@solidjs/router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";

const openai = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const breakdownTask = action(async (data: FormData) => {
  "use server";
  const task = data.get("task") as string;
  const granularity = data.get("granularity") as string;
  const clarification = data.get("clarification") as string | null;
  const hasClarification = !!clarification;

  let granularityInstruction = "Break tasks into standard, manageable chunks.";
  if (granularity === "low") granularityInstruction = "Keep tasks high-level and broad. Do not over-fragment.";
  if (granularity === "high") granularityInstruction = "Break tasks into very small, atomic, micro-steps. Be extremely detailed.";

  const { steps } = await generateText({
    model: openai("gemini-2.5-flash-lite"),
    prompt: task,
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
        inputSchema: z.object({
          title: z.string().describe("The title of the task list"),
          tasks: z.array(
            z.object({
              content: z.string().describe("The task description"),
              dueDate: z.string().optional().describe("ISO date string if a specific deadline is mentioned"),
            })
          ),
        }),
      }),
      ...(!hasClarification &&
        {askClarification: tool({
          description: "Ask the user for more details if the prompt is too vague",
          inputSchema: z.object({
            question: z.string().describe("The clarifying question to ask the user"),
          }),
        }),
        })
    },
  });

  const { toolName, input } = steps[steps.length - 1].content[0];

  return {
    ok: true,
    action: toolName,
    ...input
  }
}, "task");
