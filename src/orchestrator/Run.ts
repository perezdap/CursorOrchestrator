import type { ExecutionMode } from "../schemas/agent.schema.js";
import type { Phase } from "../schemas/task.schema.js";
import type { Workflow } from "../schemas/workflow.schema.js";
import { AcceptanceGate } from "./AcceptanceGate.js";
import type { AcceptanceRunner } from "./AcceptanceRunner.js";
import type { AgentRegistry } from "./AgentRegistry.js";
import { PhaseExecutor } from "./PhaseExecutor.js";
import type { PhaseRunner } from "./PhaseRunner.js";
import { formatFinalReport } from "./RunReports.js";
import type { RunProgressReporter } from "./RunProgress.js";
import type { RunState } from "./RunState.js";

export interface RunWorkflowResult {
  runId: string;
  runDir: string;
  status: "completed" | "failed";
  acceptancePassed: boolean;
  phasesCompleted: number;
  phasesTotal: number;
  message: string;
}

export interface RunContext {
  runState: RunState;
  phaseRunner: PhaseRunner;
  acceptanceRunner: AcceptanceRunner;
  registry: AgentRegistry;
  progress: RunProgressReporter;
  dryRun: boolean;
}

export interface RunOptions extends RunContext {
  executionMode: ExecutionMode;
  repoUrl?: string;
  repoUrlSource?: "flag" | "git";
}

export class Run {
  private readonly phaseExecutor: PhaseExecutor;
  private runStartedAt = 0;

  constructor(private readonly options: RunOptions) {
    this.phaseExecutor = new PhaseExecutor({
      phaseRunner: options.phaseRunner,
      acceptanceRunner: options.acceptanceRunner,
      runState: options.runState,
      progress: options.progress,
      dryRun: options.dryRun,
    });
  }

  async execute(workflow: Workflow, executionOrder: Phase[]): Promise<RunWorkflowResult> {
    const { runState, progress, dryRun } = this.options;

    runState.setStatus("running");
    runState.appendPhaseLog(`Workflow **${workflow.name}** started`);
    this.runStartedAt = Date.now();

    progress.workflowStarted({
      runId: runState.runId,
      workflowName: workflow.name,
      phasesTotal: executionOrder.length,
      executionMode: this.options.executionMode,
      dryRun,
      repoUrl: this.options.repoUrl,
      repoUrlSource: this.options.repoUrlSource,
    });

    let phasesCompleted = 0;

    for (const [index, phase] of executionOrder.entries()) {
      const record = runState.getPhaseRecord(phase.id);
      if (record.status === "completed" || record.status === "skipped") {
        phasesCompleted += 1;
        continue;
      }

      const agentConfig = this.options.registry.resolve(phase.agent);
      const phaseIndex = index + 1;

      const result = await this.phaseExecutor.executePhase(phase, agentConfig, {
        phaseIndex,
        phasesTotal: executionOrder.length,
      });

      if (!result.success) {
        const message =
          result.error === "Phase acceptance criteria failed"
            ? `Phase "${phase.id}" acceptance failed`
            : `Phase "${phase.id}" failed: ${result.error ?? "unknown"}`;
        return this.failRun(executionOrder.length, phasesCompleted, {
          error: result.error,
          message,
        });
      }

      phasesCompleted += 1;
    }

    const workflowAcceptance = workflow.acceptance;
    let acceptancePassed = true;

    if (workflowAcceptance?.criteria.length) {
      const maxAttempts = workflowAcceptance.maxRetries + 1;
      progress.acceptanceStarted({
        scope: "workflow",
        criteriaCount: workflowAcceptance.criteria.length,
        maxAttempts,
      });

      const gate = this.createAcceptanceGate({
        onAttemptStart: (attempt, total) => {
          progress.acceptanceAttempt({
            scope: "workflow",
            attempt,
            maxAttempts: total,
          });
        },
        onAttemptFailed: async (attempt) => {
          if (!workflowAcceptance.retryPhase) return;
          runState.appendPhaseLog(
            `Acceptance failed (attempt ${attempt}). Retrying phase **${workflowAcceptance.retryPhase}**`,
          );
          const retryPhase = workflow.phases.find(
            (p) => p.id === workflowAcceptance.retryPhase,
          );
          if (retryPhase) {
            await this.options.phaseRunner.runPhase(
              retryPhase,
              this.options.registry.resolve(retryPhase.agent),
            );
          }
        },
      });

      const result = await gate.evaluate(workflowAcceptance.criteria, {
        maxRetries: workflowAcceptance.maxRetries,
      });

      progress.acceptanceFinished({
        scope: "workflow",
        passed: result.passed,
        attempts: result.attempts,
      });

      acceptancePassed = result.passed;
    }

    const finalStatus = acceptancePassed ? "completed" : "failed";
    const message = acceptancePassed
      ? "Workflow completed successfully"
      : "Workflow failed acceptance after retries";

    runState.setStatus(finalStatus);
    runState.setCurrentPhase(undefined);
    runState.writeFinalReport(this.buildFinalReport(acceptancePassed));

    progress.workflowFinished({
      runId: runState.runId,
      status: finalStatus,
      durationMs: Date.now() - this.runStartedAt,
      message,
    });

    return {
      runId: runState.runId,
      runDir: runState.runDir,
      status: finalStatus,
      acceptancePassed,
      phasesCompleted,
      phasesTotal: executionOrder.length,
      message,
    };
  }

  private createAcceptanceGate(options?: {
    onAttemptStart?: (attempt: number, maxAttempts: number) => void;
    onAttemptFailed?: (attempt: number) => Promise<void>;
  }): AcceptanceGate {
    return new AcceptanceGate({
      acceptanceRunner: this.options.acceptanceRunner,
      persistReport: (report) => this.options.runState.writeAcceptanceReport(report),
      onAttemptStart: options?.onAttemptStart,
      onAttemptFailed: options?.onAttemptFailed,
    });
  }

  private failRun(
    phasesTotal: number,
    phasesCompleted: number,
    params: { error?: string; message: string },
  ): RunWorkflowResult {
    const { runState, progress } = this.options;

    runState.setStatus("failed");
    runState.setCurrentPhase(undefined);
    runState.writeFinalReport(this.buildFinalReport(false, params.error));

    progress.workflowFinished({
      runId: runState.runId,
      status: "failed",
      durationMs: Date.now() - this.runStartedAt,
      message: params.message,
    });

    return {
      runId: runState.runId,
      runDir: runState.runDir,
      status: "failed",
      acceptancePassed: false,
      phasesCompleted,
      phasesTotal,
      message: params.message,
    };
  }

  private buildFinalReport(success: boolean, error?: string): string {
    const data = this.options.runState.toJSON();
    return formatFinalReport({
      runId: data.runId,
      workflowName: data.workflowName,
      updatedAt: data.updatedAt,
      runDir: this.options.runState.runDir,
      phases: data.phases,
      success,
      error,
    });
  }
}
