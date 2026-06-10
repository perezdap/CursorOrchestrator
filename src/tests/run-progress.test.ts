import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConsoleRunProgress } from "../orchestrator/RunProgress.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";
import { MockAgentRunner } from "../runners/mockRunner.js";
import { validateWorkflow } from "../schemas/workflow.schema.js";
import type { RunProgressReporter } from "../orchestrator/RunProgress.js";

describe("ConsoleRunProgress", () => {
  it("writes status lines to the provided stream", () => {
    const lines: string[] = [];
    const stream = {
      write: (chunk: string) => {
        lines.push(chunk.trimEnd());
      },
    } as NodeJS.WritableStream;

    const progress = new ConsoleRunProgress(stream);
    progress.workflowStarted({
      runId: "run-1",
      workflowName: "demo",
      phasesTotal: 2,
      executionMode: "local",
      dryRun: false,
    });
    progress.phaseStarted({
      phaseIndex: 1,
      phasesTotal: 2,
      phaseId: "plan",
      agentId: "planner",
      model: "auto",
      attempt: 1,
      dryRun: false,
    });
    progress.heartbeat({
      phaseId: "plan",
      agentId: "planner",
      elapsedMs: 30_000,
    });

    expect(lines[0]).toContain("Run run-1 started");
    expect(lines[1]).toContain("[1/2] Phase plan");
    expect(lines[2]).toContain("Still running phase plan");
  });
});

describe("Orchestrator progress", () => {
  it("emits progress events during a mocked run", async () => {
    const workflow = validateWorkflow({
      name: "progress-demo",
      agents: {
        planner: { type: "planner", model: "auto", instructions: "Plan" },
      },
      phases: [{ id: "plan", agent: "planner", objective: "Plan" }],
    });

    const events: string[] = [];
    const progress: RunProgressReporter = {
      workflowStarted: () => events.push("workflowStarted"),
      phaseStarted: () => events.push("phaseStarted"),
      phaseFinished: () => events.push("phaseFinished"),
      acceptanceStarted: () => events.push("acceptanceStarted"),
      acceptanceAttempt: () => events.push("acceptanceAttempt"),
      acceptanceFinished: () => events.push("acceptanceFinished"),
      heartbeat: () => events.push("heartbeat"),
      workflowFinished: () => events.push("workflowFinished"),
    };

    const mockRunner = new MockAgentRunner();
    mockRunner.setResponse("plan", {
      phaseId: "plan",
      result: "done",
      success: true,
    });

    const cwd = mkdtempSync(join(tmpdir(), "progress-test-"));
    try {
      const orchestrator = new Orchestrator({
        cwd,
        agentRunner: mockRunner,
        progress,
      });

      await orchestrator.run({
        workflow,
        inputs: { task: "test", repoPath: cwd },
      });

      expect(events).toContain("workflowStarted");
      expect(events).toContain("phaseStarted");
      expect(events).toContain("phaseFinished");
      expect(events).toContain("workflowFinished");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
