import type { AgentOptions } from "@cursor/sdk";
import { redactSecrets } from "../policies/commandPolicy.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

export interface CursorRunnerCoreConfig {
  runnerLabel: string;
  apiKey?: string;
  buildAgentOptions: (input: AgentRunInput, apiKey: string) => AgentOptions;
}

function missingApiKeyResult(runnerLabel: string): AgentRunResult {
  return {
    success: false,
    status: "error",
    error: `CURSOR_API_KEY is required for ${runnerLabel}`,
    artifacts: [],
  };
}

function mapRunResult(
  input: AgentRunInput,
  agentId: string,
  result: { id: string; status: string; result?: string },
): AgentRunResult {
  const finished = result.status === "finished";
  return {
    success: finished,
    status: finished ? "finished" : "error",
    result: result.result ? redactSecrets(result.result) : undefined,
    agentSessionId: agentId,
    runSessionId: result.id,
    error: finished ? undefined : `Run ended with status: ${result.status}`,
    artifacts: input.agentConfig.outputs ?? [],
  };
}

function mapRunError(runnerLabel: string, err: unknown): AgentRunResult {
  const message = err instanceof Error ? err.message : String(err);
  const isRetryable =
    err && typeof err === "object" && "isRetryable" in err
      ? Boolean((err as { isRetryable?: boolean }).isRetryable)
      : false;

  return {
    success: false,
    status: "error",
    error: redactSecrets(
      `${runnerLabel} failed${isRetryable ? " (retryable)" : ""}: ${message}`,
    ),
    artifacts: [],
  };
}

export async function runCursorAgent(
  input: AgentRunInput,
  config: CursorRunnerCoreConfig,
): Promise<AgentRunResult> {
  const apiKey = input.apiKey ?? config.apiKey ?? process.env.CURSOR_API_KEY;
  if (!apiKey) {
    return missingApiKeyResult(config.runnerLabel);
  }

  try {
    const { Agent } = await import("@cursor/sdk");

    await using agent = await Agent.create(config.buildAgentOptions(input, apiKey));

    const run = await agent.send(input.prompt);
    const result = await run.wait();

    return mapRunResult(input, agent.agentId, result);
  } catch (err) {
    return mapRunError(config.runnerLabel, err);
  }
}
