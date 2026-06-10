import type { AgentConfig } from "../schemas/agent.schema.js";
import type { ResolvedSkill } from "../skills/SkillResolver.js";
import {
  buildPhaseInputArtifacts,
  buildPhasePromptBody,
  composeAgentPrompt,
} from "./composeAgentPrompt.js";

export interface ComposePhasePromptPhase {
  id: string;
  objective: string;
  inputs?: string[];
  outputs?: string[];
  context?: Record<string, string>;
}

export interface ComposePhasePromptOptions {
  phase: ComposePhasePromptPhase;
  agentConfig: AgentConfig;
  taskContext: Record<string, string>;
  artifactsDir: string;
  cwd: string;
  skills?: ResolvedSkill[];
}

export class PromptComposer {
  composePhasePrompt(options: ComposePhasePromptOptions): string {
    const { phase, agentConfig, taskContext, artifactsDir, cwd, skills } = options;

    const body = buildPhasePromptBody({
      objective: phase.objective,
      task: taskContext.task,
      inputArtifacts: buildPhaseInputArtifacts(artifactsDir, phase.inputs),
      outputArtifacts: phase.outputs,
    });

    return composeAgentPrompt({
      agentId: agentConfig.type,
      agentConfig,
      prompt: body,
      cwd,
      executionMode: "local",
      runId: "",
      phaseId: phase.id,
      artifactsDir,
      context: {
        ...taskContext,
        ...(phase.context ?? {}),
      },
      skills,
    });
  }
}
