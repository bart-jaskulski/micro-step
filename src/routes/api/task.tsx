import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";
import type { APIEvent } from "@solidjs/start/server";

const openai = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const POST = async (event: APIEvent) => {
  const { task, granularity } = await event.request.json();
  console.log(task, granularity);

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
      3. If the user's request is too vague (e.g., "work", "project"), use the 'askClarification' tool.
      4. If the request is actionable, use the 'createTasks' tool immediately.
      5. Do not be chatty. Only use tools.
    `,
    tools: {
      createTasks: tool({
        description: "Create a list of tasks from the prompt",
        inputSchema: z.object({
          tasks: z.array(
            z.object({
              content: z.string().describe("The task description"),
              dueDate: z.string().optional().describe("ISO date string if a specific deadline is mentioned"),
            })
          ),
        }),
      }),
      askClarification: tool({
        description: "Ask the user for more details if the prompt is too vague",
        inputSchema: z.object({
          question: z.string().describe("The clarifying question to ask the user"),
        }),
      }),
    },
  });

  return steps[steps.length - 1].content;
};
