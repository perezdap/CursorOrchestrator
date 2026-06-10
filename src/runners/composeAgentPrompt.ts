import { join } from "node:path";
import type { AgentRunInput } from "./types.js";

export interface PhasePromptBodyOptions {
  objective: string;
  task?: string;
  inputArtifacts?: Array<{ name: string; path: string }>;
  outputArtifacts?: string[];
}

export function buildPhasePromptBody(options: PhasePromptBodyOptions): string {
  const parts = [options.objective, "", `Task: ${options.task ?? "(not specified)"}`];

  if (options.inputArtifacts?.length) {
    parts.push("", "Required inputs:");
    for (const input of options.inputArtifacts) {
      parts.push(`- ${input.name} (look in artifacts: ${input.path})`);
    }
  }

  if (options.outputArtifacts?.length) {
    parts.push("", "Expected outputs:");
    for (const output of options.outputArtifacts) {
      parts.push(`- ${output}`);
    }
  }

  return parts.join("\n");
}

export function composeAgentPrompt(input: AgentRunInput): string {
  const parts = [
    `# Agent Role: ${input.agentConfig.type}`,
    "",
    "## Instructions",
    input.agentConfig.instructions,
    "",
    `## Phase: ${input.phaseId}`,
    "## Objective",
    input.prompt,
  ];

  if (input.skills?.length) {
    parts.push("", "## Skills");
    for (const skill of input.skills) {
      parts.push("", `### ${skill.name}`, skill.body);
    }
  }

  if (input.context && Object.keys(input.context).length > 0) {
    parts.push("", "## Context");
    for (const [key, value] of Object.entries(input.context)) {
      parts.push(`${key}: ${value}`);
    }
  }

  parts.push("", `Artifacts directory: ${input.artifactsDir}`);
  return parts.join("\n");
}

export function buildPhaseInputArtifacts(
  artifactsDir: string,
  names?: string[],
): Array<{ name: string; path: string }> | undefined {
  if (!names?.length) return undefined;
  return names.map((name) => ({
    name,
    path: join(artifactsDir, name),
  }));
}
