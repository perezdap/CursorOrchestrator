import { join } from "node:path";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

export const agentReviewCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "agent_review" }>
> = {
  type: "agent_review",
  async run(check, ctx, base) {
    if (!ctx.agentRunner) {
      return {
        ...base,
        passed: false,
        message: "Agent runner not configured for agent_review check",
      };
    }

    const artifactsDir =
      ctx.artifactsDir ?? join(ctx.cwd, ".runs", ctx.runId, "artifacts");

    const agentRunInput = {
      agentId: check.agent ?? "verifier",
      agentConfig: {
        type: "verifier" as const,
        model: "auto",
        instructions: check.prompt,
      },
      prompt: check.prompt,
      cwd: ctx.cwd,
      executionMode: "local" as const,
      runId: ctx.runId,
      phaseId: `acceptance-${check.id}`,
      artifactsDir,
    };

    const result = await ctx.agentRunner.run(agentRunInput);

    const passed =
      result.success &&
      (result.result?.toLowerCase().includes("pass") ||
        result.result?.toLowerCase().includes("approved") ||
        !result.result?.toLowerCase().includes("fail"));

    return {
      ...base,
      passed: Boolean(passed),
      message: passed ? "Agent review passed" : "Agent review failed",
      output: result.result,
    };
  },
};
