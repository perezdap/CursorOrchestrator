import type { AgentOptions } from "@cursor/sdk";
import { runCursorAgent } from "./cursorRunnerCore.js";
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./types.js";

export interface CursorLocalRunnerOptions {
  apiKey?: string;
}

export class CursorLocalRunner implements AgentRunner {
  readonly name = "cursor-local";

  constructor(private readonly options: CursorLocalRunnerOptions = {}) {}

  run(input: AgentRunInput): Promise<AgentRunResult> {
    return runCursorAgent(input, {
      runnerLabel: "Cursor local runner",
      apiKey: this.options.apiKey,
      buildAgentOptions: (runInput, apiKey): AgentOptions => ({
        apiKey,
        model: { id: runInput.agentConfig.model },
        local: {
          cwd: runInput.cwd,
          settingSources: [],
        },
      }),
    });
  }
}
