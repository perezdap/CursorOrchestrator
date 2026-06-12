/**
 * Cursor cloud agent runner — agents execute on Cursor-hosted VMs against a GitHub clone.
 * Security: see docs/security.md (threat model, repo URL validation, cloud vs local).
 */
import type { AgentOptions } from "@cursor/sdk";
import { runCursorAgent } from "./cursorRunnerCore.js";
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./types.js";

export interface CursorCloudRunnerOptions {
  apiKey?: string;
  autoCreatePr?: boolean;
  skipReviewerRequest?: boolean;
}

export class CursorCloudRunner implements AgentRunner {
  readonly name = "cursor-cloud";

  constructor(private readonly options: CursorCloudRunnerOptions = {}) {}

  run(input: AgentRunInput): Promise<AgentRunResult> {
    return runCursorAgent(input, {
      runnerLabel: "Cursor cloud runner",
      apiKey: this.options.apiKey,
      buildAgentOptions: (runInput, apiKey): AgentOptions => {
        const repoUrl = runInput.context?.repoUrl ?? runInput.context?.repository;
        return {
          apiKey,
          model: { id: runInput.agentConfig.model },
          cloud: {
            ...(repoUrl ? { repos: [{ url: repoUrl }] } : {}),
            autoCreatePR: this.options.autoCreatePr ?? false,
            skipReviewerRequest: this.options.skipReviewerRequest ?? true,
          },
        };
      },
    });
  }
}
