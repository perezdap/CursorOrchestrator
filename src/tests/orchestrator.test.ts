import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { AgentRegistry } from "../orchestrator/AgentRegistry.js";
import { AcceptanceRunner } from "../orchestrator/AcceptanceRunner.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";
import { TaskGraph } from "../orchestrator/TaskGraph.js";
import { MockAgentRunner } from "../runners/mockRunner.js";
import { NodeShellRunner } from "../runners/shellRunner.js";
import { validateWorkflow } from "../schemas/workflow.schema.js";

const testWorkflow = validateWorkflow({
  name: "mock-workflow",
  agents: {
    planner: { type: "planner", model: "auto", instructions: "Plan" },
    implementer: { type: "implementer", model: "auto", instructions: "Implement" },
    reviewer: { type: "reviewer", model: "auto", instructions: "Review" },
    verifier: { type: "verifier", model: "auto", instructions: "Verify" },
  },
  phases: [
    {
      id: "intake",
      agent: "planner",
      objective: "Plan the task",
      outputs: ["plan.md", "acceptance.md"],
    },
    {
      id: "implement",
      agent: "implementer",
      objective: "Implement",
      dependsOn: ["intake"],
    },
    {
      id: "review",
      agent: "reviewer",
      objective: "Review",
      dependsOn: ["implement"],
    },
    {
      id: "verify",
      agent: "verifier",
      objective: "Verify",
      dependsOn: ["review"],
    },
  ],
  acceptance: {
    maxRetries: 2,
    criteria: [
      {
        id: "plan-artifact",
        type: "markdown_artifact",
        path: "plan.md",
        required: true,
      },
      {
        id: "echo-check",
        type: "command",
        command: process.platform === "win32" ? "Write-Output ok" : "echo ok",
        required: true,
      },
      {
        id: "manual-ok",
        type: "manual_approval",
        message: "Approve completion",
        required: true,
      },
    ],
  },
});

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "orchestrator-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("TaskGraph", () => {
  it("orders phases by dependencies", () => {
    const graph = new TaskGraph(testWorkflow.phases);
    const order = graph.getExecutionOrder().map((p) => p.id);
    expect(order).toEqual(["intake", "implement", "review", "verify"]);
  });
});

describe("AgentRegistry", () => {
  it("resolves workflow agents with type defaults", () => {
    const registry = new AgentRegistry();
    registry.registerWorkflowAgents(testWorkflow.agents);
    const agent = registry.resolve("planner");
    expect(agent.type).toBe("planner");
    expect(agent.instructions).toBe("Plan");
    expect(agent.outputs).toContain("plan.md");
  });

  it("lists built-in agent types", () => {
    const registry = new AgentRegistry();
    expect(registry.listTypes().length).toBeGreaterThanOrEqual(10);
  });
});

describe("AcceptanceRunner", () => {
  it("runs acceptance checks and produces a report", async () => {
    const cwd = createTempCwd();
    const artifactsDir = join(cwd, ".runs", "test-run", "artifacts");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, "plan.md"), "# Plan\n\nDetailed plan content.", "utf-8");

    const runner = new AcceptanceRunner({
      cwd,
      runId: "test-run",
      shellRunner: new NodeShellRunner({ enforcePolicy: false }),
      approvalPolicy: new ApprovalPolicy({ autoApproveInTests: true, autoApproveManualChecks: true }),
      artifactsDir,
    });

    const report = await runner.runChecks(
      [
        { id: "plan", type: "markdown_artifact", path: "plan.md", required: true },
        { id: "cmd", type: "command", command: process.platform === "win32" ? "exit 0" : "true", required: true },
      ],
      1,
    );

    expect(report.passed).toBe(true);
    expect(report.results).toHaveLength(2);
  });
});

describe("Orchestrator", () => {
  it("completes a full workflow with mocked agent runner", async () => {
    const cwd = createTempCwd();
    const mockRunner = new MockAgentRunner();

    for (const phase of testWorkflow.phases) {
      mockRunner.setResponse(phase.id, {
        phaseId: phase.id,
        result: `Completed ${phase.id}`,
        success: true,
        artifacts:
          phase.id === "intake"
            ? {
                "plan.md": "# Plan\n\nTest plan for mock workflow.",
                "acceptance.md": "# Acceptance\n\n- Tests pass",
              }
            : undefined,
      });
    }

    const orchestrator = new Orchestrator({
      cwd,
      agentRunner: mockRunner,
      approvalPolicy: new ApprovalPolicy({ autoApproveInTests: true, autoApproveManualChecks: true }),
      shellRunner: new NodeShellRunner({ enforcePolicy: false }),
    });

    const result = await orchestrator.run({
      workflow: testWorkflow,
      inputs: { task: "Add unit tests", repoPath: cwd },
    });

    expect(result.status).toBe("completed");
    expect(result.acceptancePassed).toBe(true);
    expect(result.phasesCompleted).toBe(4);

    expect(existsSync(join(result.runDir, "request.md"))).toBe(true);
    expect(existsSync(join(result.runDir, "workflow.yaml"))).toBe(true);
    expect(existsSync(join(result.runDir, "phase-log.md"))).toBe(true);
    expect(existsSync(join(result.runDir, "acceptance-report.json"))).toBe(true);
    expect(existsSync(join(result.runDir, "acceptance-report.md"))).toBe(true);
    expect(existsSync(join(result.runDir, "final-report.md"))).toBe(true);
    expect(existsSync(join(result.runDir, "artifacts", "plan.md"))).toBe(true);

    const acceptanceReport = JSON.parse(
      readFileSync(join(result.runDir, "acceptance-report.json"), "utf-8"),
    ) as { passed: boolean };
    expect(acceptanceReport.passed).toBe(true);
  });

  it("retries acceptance when criteria fail initially", async () => {
    const cwd = createTempCwd();
    const mockRunner = new MockAgentRunner();

    for (const phase of testWorkflow.phases) {
      mockRunner.setResponse(phase.id, {
        phaseId: phase.id,
        result: `Done ${phase.id}`,
        success: true,
        artifacts:
          phase.id === "intake"
            ? { "plan.md": "# Plan\n\nRetry test plan." }
            : undefined,
      });
    }

    let callCount = 0;
    const shellRunner = new NodeShellRunner({ enforcePolicy: false });
    const originalRun = shellRunner.run.bind(shellRunner);
    shellRunner.run = async (input) => {
      if (input.command.includes("fail-first")) {
        callCount += 1;
        if (callCount === 1) {
          return { exitCode: 1, stdout: "", stderr: "intentional fail", durationMs: 1 };
        }
        return { exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 };
      }
      return originalRun(input);
    };

    const workflowWithRetry = validateWorkflow({
      ...testWorkflow,
      acceptance: {
        maxRetries: 1,
        retryPhase: "implement",
        criteria: [
          { id: "plan", type: "markdown_artifact", path: "plan.md", required: true },
          {
            id: "flaky",
            type: "command",
            command: "fail-first",
            required: true,
          },
        ],
      },
    });

    const orchestrator = new Orchestrator({
      cwd,
      agentRunner: mockRunner,
      shellRunner,
    });

    const result = await orchestrator.run({
      workflow: workflowWithRetry,
      inputs: { task: "Retry test", repoPath: cwd },
    });

    expect(result.acceptancePassed).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});
