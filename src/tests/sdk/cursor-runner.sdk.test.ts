import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CursorLocalRunner } from "../../runners/cursorLocalRunner.js";
import type { AgentRunInput } from "../../runners/types.js";
import { createTempCwd } from "../helpers/tempDirs.js";

function createAgentRunInput(cwd: string): AgentRunInput {
  return {
    agentId: "planner",
    agentConfig: { type: "planner", model: "auto", instructions: "Test" },
    prompt: "Reply with exactly: ok",
    cwd,
    executionMode: "local",
    runId: "cursor-sdk-test",
    phaseId: "probe",
    artifactsDir: join(cwd, "artifacts"),
  };
}

describe("Cursor SDK integration", () => {
  it.skipIf(!process.env.CURSOR_API_KEY)(
    "CursorLocalRunner completes a minimal prompt",
    async () => {
      const cwd = createTempCwd("cursor-sdk-local-");
      const runner = new CursorLocalRunner({ apiKey: process.env.CURSOR_API_KEY });
      const result = await runner.run(createAgentRunInput(cwd));

      expect(result.success).toBe(true);
      expect(result.result).toBeTruthy();
    },
    120_000,
  );
});
