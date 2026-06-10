import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { AcceptanceReport } from "../schemas/acceptance.schema.js";
import { formatAcceptanceReportMarkdown } from "./RunReports.js";
import type { PhaseRunRecord, PhaseStatus } from "../schemas/task.schema.js";
import type { Workflow } from "../schemas/workflow.schema.js";

export interface RunStateData {
  runId: string;
  workflowName: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  createdAt: string;
  updatedAt: string;
  cwd: string;
  inputs: Record<string, unknown>;
  phases: PhaseRunRecord[];
  currentPhaseId?: string;
  acceptanceAttempt: number;
  agentSessionIds: Record<string, string>;
}

export class RunState {
  private data: RunStateData;

  constructor(
    public readonly runDir: string,
    data?: RunStateData,
  ) {
    if (data) {
      this.data = data;
    } else {
      throw new Error("RunState requires initial data or load from disk");
    }
  }

  static createNew(
    runId: string,
    workflow: Workflow,
    cwd: string,
    inputs: Record<string, unknown>,
  ): RunState {
    const runDir = join(cwd, ".runs", runId);
    mkdirSync(join(runDir, "agent-messages"), { recursive: true });
    mkdirSync(join(runDir, "artifacts"), { recursive: true });

    const now = new Date().toISOString();
    const data: RunStateData = {
      runId,
      workflowName: workflow.name,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      cwd,
      inputs,
      phases: workflow.phases.map((p) => ({
        phaseId: p.id,
        status: "pending" as PhaseStatus,
        attempts: 0,
        artifacts: [],
      })),
      acceptanceAttempt: 0,
      agentSessionIds: {},
    };

    const state = new RunState(runDir, data);
    state.persistWorkflow(workflow);
    state.persistRequest(inputs);
    state.save();
    return state;
  }

  static load(runDir: string): RunState {
    const statePath = join(runDir, "state.json");
    if (!existsSync(statePath)) {
      throw new Error(`Run state not found: ${statePath}`);
    }
    const data = JSON.parse(readFileSync(statePath, "utf-8")) as RunStateData;
    return new RunState(runDir, data);
  }

  static findRunDir(cwd: string, runId: string): string {
    return join(cwd, ".runs", runId);
  }

  get runId(): string {
    return this.data.runId;
  }

  get status(): RunStateData["status"] {
    return this.data.status;
  }

  get phases(): PhaseRunRecord[] {
    return this.data.phases;
  }

  getPhaseRecord(phaseId: string): PhaseRunRecord {
    const record = this.data.phases.find((p) => p.phaseId === phaseId);
    if (!record) {
      throw new Error(`Phase record not found: ${phaseId}`);
    }
    return record;
  }

  updatePhase(phaseId: string, update: Partial<PhaseRunRecord>): void {
    const record = this.getPhaseRecord(phaseId);
    Object.assign(record, update);
    this.touch();
  }

  setStatus(status: RunStateData["status"]): void {
    this.data.status = status;
    this.touch();
  }

  setCurrentPhase(phaseId: string | undefined): void {
    this.data.currentPhaseId = phaseId;
    this.touch();
  }

  incrementAcceptanceAttempt(): number {
    this.data.acceptanceAttempt += 1;
    this.touch();
    return this.data.acceptanceAttempt;
  }

  setAgentSession(phaseId: string, agentSessionId: string): void {
    this.data.agentSessionIds[phaseId] = agentSessionId;
    this.touch();
  }

  appendPhaseLog(entry: string): void {
    const logPath = join(this.runDir, "phase-log.md");
    const line = `\n## ${new Date().toISOString()}\n${entry}\n`;
    if (existsSync(logPath)) {
      writeFileSync(logPath, readFileSync(logPath, "utf-8") + line, "utf-8");
    } else {
      writeFileSync(logPath, `# Phase Log\n${line}`, "utf-8");
    }
  }

  saveAgentMessage(phaseId: string, content: string): void {
    const path = join(this.runDir, "agent-messages", `${phaseId}.md`);
    writeFileSync(path, content, "utf-8");
  }

  persistWorkflow(workflow: Workflow): void {
    writeFileSync(
      join(this.runDir, "workflow.yaml"),
      stringifyYaml(workflow),
      "utf-8",
    );
  }

  persistRequest(inputs: Record<string, unknown>): void {
    const task = typeof inputs.task === "string" ? inputs.task : JSON.stringify(inputs, null, 2);
    writeFileSync(join(this.runDir, "request.md"), `# Request\n\n${task}\n`, "utf-8");
  }

  writeAcceptanceReport(report: AcceptanceReport): void {
    writeFileSync(
      join(this.runDir, "acceptance-report.json"),
      JSON.stringify(report, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(this.runDir, "acceptance-report.md"),
      formatAcceptanceReportMarkdown(report),
      "utf-8",
    );
  }

  writeFinalReport(content: string): void {
    writeFileSync(join(this.runDir, "final-report.md"), content, "utf-8");
  }

  save(): void {
    writeFileSync(
      join(this.runDir, "state.json"),
      JSON.stringify(this.data, null, 2),
      "utf-8",
    );
  }

  toJSON(): RunStateData {
    return { ...this.data };
  }

  private touch(): void {
    this.data.updatedAt = new Date().toISOString();
    this.save();
  }
}

export function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
