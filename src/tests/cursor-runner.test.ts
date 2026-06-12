import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CursorCloudRunner } from "../runners/cursorCloudRunner.js";
import { CursorLocalRunner } from "../runners/cursorLocalRunner.js";
import type { AgentRunInput } from "../runners/types.js";
import { createTempCwd } from "./helpers/tempDirs.js";

function createAgentRunInput(cwd: string, executionMode: "local" | "cloud"): AgentRunInput {
  return {
    agentId: "planner",
    agentConfig: { type: "planner", model: "auto", instructions: "Test" },
    prompt: "Reply with exactly: ok",
    cwd,
    executionMode,
    runId: "cursor-runner-test",
    phaseId: "probe",
    artifactsDir: join(cwd, "artifacts"),
  };
}

describe("Cursor runners without live SDK", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("CursorLocalRunner fails fast when CURSOR_API_KEY is unset", async () => {
    vi.stubEnv("CURSOR_API_KEY", "");
    const cwd = createTempCwd("cursor-local-test-");
    const runner = new CursorLocalRunner();
    const result = await runner.run(createAgentRunInput(cwd, "local"));

    expect(result.success).toBe(false);
    expect(result.error).toContain("CURSOR_API_KEY");
  });

  it("CursorCloudRunner fails fast when CURSOR_API_KEY is unset", async () => {
    vi.stubEnv("CURSOR_API_KEY", "");
    const cwd = createTempCwd("cursor-cloud-test-");
    const runner = new CursorCloudRunner();
    const result = await runner.run(createAgentRunInput(cwd, "cloud"));

    expect(result.success).toBe(false);
    expect(result.error).toContain("CURSOR_API_KEY");
  });
});
