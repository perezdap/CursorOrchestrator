import { describe, expect, it } from "vitest";
import {
  buildPhasePromptBody,
  composeAgentPrompt,
} from "../runners/composeAgentPrompt.js";
import type { AgentRunInput } from "../runners/types.js";

describe("composeAgentPrompt", () => {
  it("wraps phase content with role, instructions, context, and artifacts dir", () => {
    const input: AgentRunInput = {
      agentId: "planner",
      agentConfig: {
        type: "planner",
        model: "auto",
        instructions: "Plan the work.",
      },
      prompt: "Understand the task.",
      cwd: "C:\\repo",
      executionMode: "local",
      runId: "run-1",
      phaseId: "intake",
      artifactsDir: "C:\\repo\\.runs\\run-1\\artifacts",
      context: { task: "Add tests" },
    };

    const prompt = composeAgentPrompt(input);

    expect(prompt).toContain("# Agent Role: planner");
    expect(prompt).toContain("Plan the work.");
    expect(prompt).toContain("## Phase: intake");
    expect(prompt).toContain("Understand the task.");
    expect(prompt).toContain("task: Add tests");
    expect(prompt).toContain("Artifacts directory:");
  });

  it("includes resolved skills in the prompt", () => {
    const input: AgentRunInput = {
      agentId: "planner",
      agentConfig: {
        type: "planner",
        model: "auto",
        instructions: "Plan the work.",
      },
      prompt: "Understand the task.",
      cwd: "C:\\repo",
      executionMode: "local",
      runId: "run-1",
      phaseId: "intake",
      artifactsDir: "C:\\repo\\.runs\\run-1\\artifacts",
      skills: [
        {
          id: "planner",
          name: "planner",
          body: "Write plan.md and acceptance.md.",
          source: "framework",
        },
      ],
    };

    const prompt = composeAgentPrompt(input);

    expect(prompt).toContain("## Skills");
    expect(prompt).toContain("### planner");
    expect(prompt).toContain("Write plan.md and acceptance.md.");
  });
});

describe("buildPhasePromptBody", () => {
  it("includes objective, task, inputs, and outputs", () => {
    const body = buildPhasePromptBody({
      objective: "Implement feature",
      task: "Add login",
      inputArtifacts: [{ name: "plan.md", path: "C:\\artifacts\\plan.md" }],
      outputArtifacts: ["summary.md"],
    });

    expect(body).toContain("Implement feature");
    expect(body).toContain("Add login");
    expect(body).toContain("plan.md");
    expect(body).toContain("summary.md");
  });
});
