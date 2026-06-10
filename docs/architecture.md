# Architecture

## Overview

Cursor Orchestrator separates **workflow definition**, **execution**, **acceptance**, and **persistence** into small modules. The Cursor SDK is only used inside runner implementations.

```mermaid
flowchart TB
  CLI[CLI] --> Orch[Orchestrator]
  Orch --> Run[Run]
  Orch --> TG[TaskGraph]
  Run --> PE[PhaseExecutor]
  Run --> AG[AcceptanceGate]
  PE --> PR[PhaseRunner]
  PE --> AG
  PR --> PC[PromptComposer]
  PR --> Runner[AgentRunner]
  AC[AcceptanceRunner] --> Checks[acceptanceChecks handlers]
  AC --> PG[PolicyGate]
  AC --> Shell[ShellRunner]
  AC --> Runner
  Runner --> Local[CursorLocalRunner]
  Runner --> Cloud[CursorCloudRunner]
  Runner --> Mock[MockAgentRunner]
  Run --> RS[RunState]
  RS --> RR[RunRecord]
  RS --> RA[RunArchive]
  PR --> AS[ArtifactStore]
  AS --> PG
  Shell --> PG
```

## Core components

### Orchestrator

Wires agent runners, shell runner, and policies; builds run context; delegates workflow execution to `Run`.

### Run

Owns the workflow walk: phase loop (via `PhaseExecutor`), workflow-level acceptance with retry remediation, final report, and failure paths.

### PhaseExecutor

Single seam for a phase: agent execution (`PhaseRunner`) followed by phase-level acceptance (`AcceptanceGate`) when criteria are declared.

### PromptComposer

Central prompt assembly for phase work — objective, task, artifacts, skills, and agent role instructions.

### TaskGraph

Builds execution order from `dependsOn` using depth-first topological sort. Detects cycles at validation and runtime.

### AgentRegistry

Maps workflow agent IDs to merged configs (workflow overrides + built-in type defaults). New agent types are registered by adding a module under `src/agents/`.

### PhaseRunner

Builds phase prompts, selects the correct runner by execution mode, persists agent messages and artifacts, and handles per-phase retries.

### AcceptanceRunner

Dispatches acceptance checks to handler modules under `src/orchestrator/acceptanceChecks/` and returns an `AcceptanceReport`.

### AcceptanceGate

Evaluates a criteria set with retry policy and optional remediation. Both phase-level and workflow-level acceptance use this module so retry semantics stay consistent.

### RunReports

Formats acceptance and final reports. `RunState` persists the rendered output.

### RunState

Facade over `RunRecord` (in-memory phase status and sessions) and `RunArchive` (`.runs/<run-id>/` layout, `state.json`, logs, and reports).

## Runner abstraction

```typescript
export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
```

The orchestrator calls `getRunner(mode)` — never imports `@cursor/sdk` directly. Cursor runners share `cursorRunnerCore` (SDK lifecycle, error mapping). Phase prompts are composed by `PromptComposer` before the runner is invoked. Local and cloud adapters differ only in `Agent.create` options. Inject `MockAgentRunner` in tests or custom runners for CI.

## Extension points

| Extend | Location |
|--------|----------|
| Agent type | `src/agents/*.agent.ts` |
| Acceptance check | `src/schemas/acceptance.schema.ts`, `src/orchestrator/acceptanceChecks/` |
| Agent runner | `src/runners/` |
| Policy rule | `src/policies/` (`PolicyGate` for enforcement at call sites) |
| Workflow | YAML under `src/examples/` or `workflows/` |

## Resumption

`state.json` tracks per-phase status. `orchestrator resume` skips completed/skipped phases and continues from pending work.

## Safety

- `commandPolicy` blocks destructive git/filesystem commands by default
- `filePolicy` prevents access outside workspace root
- `approvalPolicy` gates deletions, pushes, secrets, and manual checks
- `redactSecrets` scrubs common token patterns from logs
