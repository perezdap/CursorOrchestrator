import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { evaluateCommand } from "../policies/commandPolicy.js";
import { evaluateFileAccess } from "../policies/filePolicy.js";
import type {
  AcceptanceCheck,
  AcceptanceReport,
  AcceptanceResult,
} from "../schemas/acceptance.schema.js";
import type { AgentRunner, ShellRunner } from "../runners/types.js";

export interface AcceptanceRunnerOptions {
  cwd: string;
  runId: string;
  shellRunner: ShellRunner;
  agentRunner?: AgentRunner;
  approvalPolicy?: ApprovalPolicy;
  artifactsDir?: string;
}

export class AcceptanceRunner {
  constructor(private readonly options: AcceptanceRunnerOptions) {}

  async runChecks(
    criteria: AcceptanceCheck[],
    attempt: number,
  ): Promise<AcceptanceReport> {
    const results: AcceptanceResult[] = [];

    for (const check of criteria) {
      const start = Date.now();
      const result = await this.runSingleCheck(check);
      results.push({ ...result, durationMs: Date.now() - start });
    }

    const requiredFailed = results.some((r) => r.required && !r.passed);
    const report: AcceptanceReport = {
      runId: this.options.runId,
      timestamp: new Date().toISOString(),
      attempt,
      passed: !requiredFailed,
      results,
    };

    return report;
  }

  private async runSingleCheck(check: AcceptanceCheck): Promise<AcceptanceResult> {
    const base = {
      checkId: check.id,
      type: check.type,
      required: check.required,
      durationMs: 0,
    };

    switch (check.type) {
      case "command":
        return this.runCommandCheck(check, base);
      case "file_exists":
        return this.runFileExistsCheck(check, base);
      case "file_contains":
        return this.runFileContainsCheck(check, base);
      case "json_shape":
        return this.runJsonShapeCheck(check, base);
      case "markdown_artifact":
        return this.runMarkdownArtifactCheck(check, base);
      case "agent_review":
        return this.runAgentReviewCheck(check, base);
      case "test_result":
        return this.runTestResultCheck(check, base);
      case "manual_approval":
        return this.runManualApprovalCheck(check, base);
      default: {
        const _exhaustive: never = check;
        return {
          ...base,
          passed: false,
          message: `Unsupported check type: ${(_exhaustive as AcceptanceCheck).type}`,
        };
      }
    }
  }

  private async runCommandCheck(
    check: Extract<AcceptanceCheck, { type: "command" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): Promise<AcceptanceResult> {
    const policy = evaluateCommand(check.command);
    if (policy.verdict === "block") {
      return {
        ...base,
        passed: false,
        message: `Command blocked: ${policy.reason}`,
      };
    }

    const result = await this.options.shellRunner.run({
      command: check.command,
      cwd: check.cwd ?? this.options.cwd,
      timeoutMs: check.timeoutMs,
    });

    return {
      ...base,
      passed: result.exitCode === 0,
      message:
        result.exitCode === 0
          ? "Command succeeded"
          : `Command failed with exit code ${result.exitCode}`,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  }

  private runFileExistsCheck(
    check: Extract<AcceptanceCheck, { type: "file_exists" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): AcceptanceResult {
    const fullPath = resolve(this.options.cwd, check.path);
    const policy = evaluateFileAccess(fullPath, this.options.cwd, "read");
    if (policy.verdict === "block") {
      return { ...base, passed: false, message: policy.reason };
    }
    const exists = existsSync(fullPath);
    return {
      ...base,
      passed: exists,
      message: exists ? `File exists: ${check.path}` : `File not found: ${check.path}`,
    };
  }

  private runFileContainsCheck(
    check: Extract<AcceptanceCheck, { type: "file_contains" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): AcceptanceResult {
    const fullPath = resolve(this.options.cwd, check.path);
    if (!existsSync(fullPath)) {
      return { ...base, passed: false, message: `File not found: ${check.path}` };
    }
    const content = readFileSync(fullPath, "utf-8");
    const regex = new RegExp(check.pattern, check.flags);
    const found = regex.test(content);
    return {
      ...base,
      passed: found,
      message: found
        ? `Pattern found in ${check.path}`
        : `Pattern not found in ${check.path}`,
    };
  }

  private runJsonShapeCheck(
    check: Extract<AcceptanceCheck, { type: "json_shape" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): AcceptanceResult {
    const fullPath = resolve(this.options.cwd, check.path);
    if (!existsSync(fullPath)) {
      return { ...base, passed: false, message: `JSON file not found: ${check.path}` };
    }

    try {
      const data = JSON.parse(readFileSync(fullPath, "utf-8")) as unknown;
      const valid = this.validateJsonShape(data, check.schema);
      return {
        ...base,
        passed: valid,
        message: valid ? "JSON matches expected shape" : "JSON does not match expected shape",
      };
    } catch (err) {
      return {
        ...base,
        passed: false,
        message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private validateJsonShape(data: unknown, schema: Record<string, unknown>): boolean {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    for (const [key, expected] of Object.entries(schema)) {
      if (!(key in obj)) return false;
      if (typeof expected === "string" && typeof obj[key] !== expected) return false;
    }
    return true;
  }

  private runMarkdownArtifactCheck(
    check: Extract<AcceptanceCheck, { type: "markdown_artifact" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): AcceptanceResult {
    const searchPaths = [
      resolve(this.options.cwd, check.path),
      this.options.artifactsDir
        ? join(this.options.artifactsDir, check.path)
        : undefined,
    ].filter(Boolean) as string[];

    for (const fullPath of searchPaths) {
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf-8");
        const minLength = check.minLength ?? 1;
        const valid = content.trim().length >= minLength;
        return {
          ...base,
          passed: valid,
          message: valid
            ? `Markdown artifact found: ${check.path}`
            : `Markdown artifact too short: ${check.path}`,
        };
      }
    }

    return {
      ...base,
      passed: false,
      message: `Markdown artifact not found: ${check.path}`,
    };
  }

  private async runAgentReviewCheck(
    check: Extract<AcceptanceCheck, { type: "agent_review" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): Promise<AcceptanceResult> {
    if (!this.options.agentRunner) {
      return {
        ...base,
        passed: false,
        message: "Agent runner not configured for agent_review check",
      };
    }

    const artifactsDir =
      this.options.artifactsDir ??
      join(this.options.cwd, ".runs", this.options.runId, "artifacts");

    const agentRunInput = {
      agentId: check.agent ?? "verifier",
      agentConfig: {
        type: "verifier" as const,
        model: "auto",
        instructions: check.prompt,
      },
      prompt: check.prompt,
      cwd: this.options.cwd,
      executionMode: "local" as const,
      runId: this.options.runId,
      phaseId: `acceptance-${check.id}`,
      artifactsDir,
    };

    const result = await this.options.agentRunner.run(agentRunInput);

    const passed =
      result.success &&
      (result.result?.toLowerCase().includes("pass") ||
        result.result?.toLowerCase().includes("approved") ||
        !result.result?.toLowerCase().includes("fail"));

    return {
      ...base,
      passed: Boolean(passed),
      message: passed ? "Agent review passed" : "Agent review failed",
      output: result.result,
    };
  }

  private async runTestResultCheck(
    check: Extract<AcceptanceCheck, { type: "test_result" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): Promise<AcceptanceResult> {
    const result = await this.options.shellRunner.run({
      command: check.command,
      cwd: check.cwd ?? this.options.cwd,
    });

    const passed = this.parseTestOutput(check.parser, result.stdout + result.stderr, result.exitCode);
    return {
      ...base,
      passed,
      message: passed ? "Tests passed" : "Tests failed",
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  }

  private parseTestOutput(
    parser: "pester" | "vitest" | "jest" | "generic",
    output: string,
    exitCode: number,
  ): boolean {
    switch (parser) {
      case "pester":
        return exitCode === 0 && /Tests Passed:\s*\d+/i.test(output);
      case "vitest":
        return exitCode === 0 && (/Tests\s+\d+\s+passed/i.test(output) || /✓/.test(output));
      case "jest":
        return exitCode === 0 && /Tests:\s+.*passed/i.test(output);
      case "generic":
        return exitCode === 0;
      default: {
        const _exhaustive: never = parser;
        return exitCode === 0 && Boolean(_exhaustive);
      }
    }
  }

  private runManualApprovalCheck(
    check: Extract<AcceptanceCheck, { type: "manual_approval" }>,
    base: Omit<AcceptanceResult, "passed" | "message" | "output">,
  ): AcceptanceResult {
    const policy = this.options.approvalPolicy ?? new ApprovalPolicy({ autoApproveInTests: true });
    const request = policy.requestManualApproval(
      check.message ?? "Manual approval required",
      check.id,
    );
    const passed = policy.isApproved(request);
    return {
      ...base,
      passed,
      message: passed ? "Manual approval granted" : `Manual approval pending: ${request.id}`,
    };
  }
}
