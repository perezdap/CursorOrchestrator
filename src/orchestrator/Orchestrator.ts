import type { ExecutionMode } from "../schemas/agent.schema.js";
import type { TaskInput } from "../schemas/task.schema.js";
import type { Workflow } from "../schemas/workflow.schema.js";
import { CursorCloudRunner } from "../runners/cursorCloudRunner.js";
import { CursorLocalRunner } from "../runners/cursorLocalRunner.js";
import type { AgentRunner } from "../runners/types.js";
import { NodeShellRunner } from "../runners/shellRunner.js";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { AcceptanceGate } from "./AcceptanceGate.js";
import { AcceptanceRunner } from "./AcceptanceRunner.js";
import { AgentRegistry } from "./AgentRegistry.js";
import { ArtifactStore } from "./ArtifactStore.js";
import { PhaseRunner } from "./PhaseRunner.js";
import { formatFinalReport } from "./RunReports.js";
import { generateRunId, RunState } from "./RunState.js";
import { TaskGraph } from "./TaskGraph.js";
import {
  noopRunProgress,
  startHeartbeat,
  type RunProgressReporter,
} from "./RunProgress.js";

export interface OrchestratorOptions {
  cwd?: string;
  apiKey?: string;
  executionMode?: ExecutionMode;
  agentRunner?: AgentRunner;
  localRunner?: AgentRunner;
  cloudRunner?: AgentRunner;
  shellRunner?: NodeShellRunner;
  approvalPolicy?: ApprovalPolicy;
  dryRun?: boolean;
  progress?: RunProgressReporter;
}

export interface RunWorkflowInput {
  workflow: Workflow;
  inputs?: TaskInput;
  runId?: string;
  resume?: boolean;
}

export interface RunWorkflowResult {
  runId: string;
  runDir: string;
  status: "completed" | "failed";
  acceptancePassed: boolean;
  phasesCompleted: number;
  phasesTotal: number;
  message: string;
}

interface RunContext {
  cwd: string;
  runState: RunState;
  artifactStore: ArtifactStore;
  registry: AgentRegistry;
  phaseRunner: PhaseRunner;
  acceptanceRunner: AcceptanceRunner;
}

export class Orchestrator {
  private readonly cwd: string;
  private readonly defaultExecutionMode: ExecutionMode;
  private readonly localRunner: AgentRunner;
  private readonly cloudRunner: AgentRunner;
  private readonly shellRunner: NodeShellRunner;
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly apiKey?: string;
  private readonly dryRun: boolean;
  private readonly overrideRunner?: AgentRunner;
  private readonly progress: RunProgressReporter;
  private runStartedAt = 0;

  constructor(options: OrchestratorOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.defaultExecutionMode = options.executionMode ?? "local";
    this.apiKey = options.apiKey;
    this.localRunner = options.localRunner ?? options.agentRunner ?? new CursorLocalRunner({ apiKey: options.apiKey });
    this.cloudRunner = options.cloudRunner ?? new CursorCloudRunner({ apiKey: options.apiKey });
    this.shellRunner = options.shellRunner ?? new NodeShellRunner({ enforcePolicy: true });
    this.approvalPolicy = options.approvalPolicy ?? new ApprovalPolicy();
    this.dryRun = options.dryRun ?? false;
    this.overrideRunner = options.agentRunner;
    this.progress = options.progress ?? noopRunProgress;
  }

  async run(input: RunWorkflowInput): Promise<RunWorkflowResult> {
    const registry = new AgentRegistry();
    registry.registerWorkflowAgents(input.workflow.agents);

    const taskInputs = this.normalizeInputs(input.workflow, input.inputs);
    const cwd = String(taskInputs.repoPath ?? this.cwd);
    const executionMode = this.resolveRunExecutionMode(taskInputs);

    let runState: RunState;
    if (input.resume && input.runId) {
      const runDir = RunState.findRunDir(cwd, input.runId);
      runState = RunState.load(runDir);
    } else {
      const runId = input.runId ?? generateRunId();
      runState = RunState.createNew(runId, input.workflow, cwd, taskInputs);
    }

    const ctx = this.createRunContext({
      cwd,
      runState,
      registry,
      executionMode,
      taskInputs,
    });

    const taskGraph = new TaskGraph(input.workflow.phases);
    const executionOrder = taskGraph.getExecutionOrder();

    runState.setStatus("running");
    runState.appendPhaseLog(`Workflow **${input.workflow.name}** started`);
    this.runStartedAt = Date.now();

    this.progress.workflowStarted({
      runId: runState.runId,
      workflowName: input.workflow.name,
      phasesTotal: executionOrder.length,
      executionMode,
      dryRun: this.dryRun,
    });

    let phasesCompleted = 0;

    for (const [index, phase] of executionOrder.entries()) {
      const record = runState.getPhaseRecord(phase.id);
      if (record.status === "completed" || record.status === "skipped") {
        phasesCompleted += 1;
        continue;
      }

      const agentConfig = registry.resolve(phase.agent);
      const phaseIndex = index + 1;

      this.progress.phaseStarted({
        phaseIndex,
        phasesTotal: executionOrder.length,
        phaseId: phase.id,
        agentId: phase.agent,
        model: agentConfig.model,
        attempt: 1,
        dryRun: this.dryRun,
      });

      const phaseStartedAt = Date.now();

      if (this.dryRun) {
        runState.updatePhase(phase.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
          attempts: 1,
        });
        this.progress.phaseFinished({
          phaseId: phase.id,
          success: true,
          durationMs: Date.now() - phaseStartedAt,
        });
        phasesCompleted += 1;
        continue;
      }

      const stopHeartbeat = startHeartbeat((elapsedMs) => {
        this.progress.heartbeat({
          phaseId: phase.id,
          agentId: phase.agent,
          elapsedMs,
        });
      });

      let outcome;
      try {
        outcome = await ctx.phaseRunner.runPhase(phase, agentConfig);
      } finally {
        stopHeartbeat();
      }

      this.progress.phaseFinished({
        phaseId: phase.id,
        success: outcome.success,
        durationMs: Date.now() - phaseStartedAt,
        error: outcome.error,
      });

      if (!outcome.success) {
        return this.failRun(runState, executionOrder.length, phasesCompleted, {
          error: outcome.error,
          message: `Phase "${phase.id}" failed: ${outcome.error ?? "unknown"}`,
        });
      }

      if (phase.acceptance?.length) {
        const maxAttempts = (phase.maxRetries ?? 0) + 1;
        this.progress.acceptanceStarted({
          scope: "phase",
          phaseId: phase.id,
          criteriaCount: phase.acceptance.length,
          maxAttempts,
        });

        const gate = this.createAcceptanceGate(ctx, {
          onAttemptStart: (attempt, total) => {
            this.progress.acceptanceAttempt({
              scope: "phase",
              phaseId: phase.id,
              attempt,
              maxAttempts: total,
            });
          },
        });

        const acceptance = await gate.evaluate(phase.acceptance, {
          maxRetries: phase.maxRetries ?? 0,
        });

        this.progress.acceptanceFinished({
          scope: "phase",
          phaseId: phase.id,
          passed: acceptance.passed,
          attempts: acceptance.attempts,
        });

        if (!acceptance.passed) {
          return this.failRun(runState, executionOrder.length, phasesCompleted, {
            error: "Phase acceptance criteria failed",
            message: `Phase "${phase.id}" acceptance failed`,
          });
        }
      }

      phasesCompleted += 1;
    }

    const workflowAcceptance = input.workflow.acceptance;
    let acceptancePassed = true;

    if (workflowAcceptance?.criteria.length) {
      const maxAttempts = workflowAcceptance.maxRetries + 1;
      this.progress.acceptanceStarted({
        scope: "workflow",
        criteriaCount: workflowAcceptance.criteria.length,
        maxAttempts,
      });

      const gate = this.createAcceptanceGate(ctx, {
        onAttemptStart: (attempt, total) => {
          this.progress.acceptanceAttempt({
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
          const phase = input.workflow.phases.find(
            (p) => p.id === workflowAcceptance.retryPhase,
          );
          if (phase) {
            await ctx.phaseRunner.runPhase(phase, registry.resolve(phase.agent));
          }
        },
      });

      const result = await gate.evaluate(workflowAcceptance.criteria, {
        maxRetries: workflowAcceptance.maxRetries,
      });

      this.progress.acceptanceFinished({
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
    runState.writeFinalReport(this.buildFinalReport(runState, acceptancePassed));

    this.progress.workflowFinished({
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

  private createRunContext(params: {
    cwd: string;
    runState: RunState;
    registry: AgentRegistry;
    executionMode: ExecutionMode;
    taskInputs: Record<string, unknown>;
  }): RunContext {
    const artifactStore = new ArtifactStore(params.runState.runDir, params.cwd);
    const taskContext = this.toStringContext(params.taskInputs);

    const phaseRunner = new PhaseRunner({
      cwd: params.cwd,
      runState: params.runState,
      artifactStore,
      getRunner: (mode) => this.getRunner(mode),
      defaultExecutionMode: params.executionMode,
      taskContext,
      apiKey: this.apiKey,
    });

    const acceptanceRunner = this.createAcceptanceRunner(
      params.cwd,
      params.runState,
      artifactStore,
      params.executionMode,
    );

    return {
      cwd: params.cwd,
      runState: params.runState,
      artifactStore,
      registry: params.registry,
      phaseRunner,
      acceptanceRunner,
    };
  }

  private createAcceptanceRunner(
    cwd: string,
    runState: RunState,
    artifactStore: ArtifactStore,
    executionMode: ExecutionMode,
  ): AcceptanceRunner {
    return new AcceptanceRunner({
      cwd,
      runId: runState.runId,
      shellRunner: this.shellRunner,
      agentRunner: this.getRunner(executionMode),
      approvalPolicy: this.approvalPolicy,
      artifactsDir: artifactStore.artifactsDir,
    });
  }

  private createAcceptanceGate(
    ctx: RunContext,
    options?: {
      onAttemptStart?: (attempt: number, maxAttempts: number) => void;
      onAttemptFailed?: (attempt: number) => Promise<void>;
    },
  ): AcceptanceGate {
    return new AcceptanceGate({
      acceptanceRunner: ctx.acceptanceRunner,
      persistReport: (report) => ctx.runState.writeAcceptanceReport(report),
      onAttemptStart: options?.onAttemptStart,
      onAttemptFailed: options?.onAttemptFailed,
    });
  }

  private failRun(
    runState: RunState,
    phasesTotal: number,
    phasesCompleted: number,
    params: { error?: string; message: string },
  ): RunWorkflowResult {
    runState.setStatus("failed");
    runState.setCurrentPhase(undefined);
    runState.writeFinalReport(this.buildFinalReport(runState, false, params.error));

    this.progress.workflowFinished({
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

  private getRunner(mode: ExecutionMode): AgentRunner {
    if (this.overrideRunner) return this.overrideRunner;
    if (mode === "cloud") return this.cloudRunner;
    return this.localRunner;
  }

  private resolveRunExecutionMode(inputs: Record<string, unknown>): ExecutionMode {
    const mode = inputs.executionMode;
    if (mode === "local" || mode === "cloud") {
      return mode;
    }
    return this.defaultExecutionMode;
  }

  private normalizeInputs(
    workflow: Workflow,
    inputs?: TaskInput,
  ): Record<string, unknown> {
    return {
      ...(workflow.inputs ?? {}),
      ...(inputs ?? {}),
    };
  }

  private toStringContext(inputs: Record<string, unknown>): Record<string, string> {
    const ctx: Record<string, string> = {};
    for (const [key, value] of Object.entries(inputs)) {
      ctx[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return ctx;
  }

  private buildFinalReport(
    runState: RunState,
    success: boolean,
    error?: string,
  ): string {
    const data = runState.toJSON();
    return formatFinalReport({
      runId: data.runId,
      workflowName: data.workflowName,
      updatedAt: data.updatedAt,
      runDir: runState.runDir,
      phases: data.phases,
      success,
      error,
    });
  }
}
