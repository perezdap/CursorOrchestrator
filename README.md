# Cursor Orchestrator

Windows-first, Cursor SDK-based agent orchestration framework. Break almost any software task into phases, assign work to configurable agent types, enforce acceptance criteria, and produce durable artifacts under `.runs/<run-id>/`.

## What it does

- Loads YAML/JSON **workflows** with phases, agents, and acceptance criteria
- Executes phases in **dependency order** using pluggable **agent runners**
- Integrates with the **Cursor SDK** for local and cloud execution (without coupling the core to the SDK)
- Runs **acceptance checks** (shell commands, file checks, agent review, Pester/Vitest parsers, manual approval)
- **Retries** failed acceptance and optional retry phases
- Persists **resumable run state** and artifacts for audit and debugging
- Enforces **command and file policies** for safer automation on Windows

## Install

```powershell
git clone <repo-url> CursorOrchestrator
cd CursorOrchestrator
npm install
npm run build
```

Set your Cursor API key for live agent runs:

```powershell
$env:CURSOR_API_KEY = "cursor_..."
```

## Initialize

```powershell
npx orchestrator init
# or after linking:
orchestrator init
```

Creates `.orchestrator/config.yaml`, `workflows/`, and `.runs/`.

## Run a workflow

```powershell
orchestrator validate --workflow .\src\examples\generic-task.workflow.yaml

orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add unit tests" `
  --repo-path .
```

Progress lines print to stderr by default (`[orchestrator] [1/4] Phase intake … running`). Use `--quiet` to suppress them.

Resume a run:

```powershell
orchestrator resume --run-id <id> --repo-path .
```

List built-in agent types:

```powershell
orchestrator list-agents
```

## Run artifacts

Each run creates:

```text
.runs/<run-id>/
  request.md
  workflow.yaml
  state.json
  phase-log.md
  agent-messages/
  artifacts/
  acceptance-report.json
  acceptance-report.md
  final-report.md
```

## Add a new agent type

1. Create `src/agents/my-agent.agent.ts` exporting an `AgentTypeModule`
2. Register it in `src/agents/index.ts`
3. Reference the type in workflow YAML under `agents.<id>.type`

See [docs/agents.md](docs/agents.md).

## Add a new acceptance check

Extend `acceptanceCheckSchema` in `src/schemas/acceptance.schema.ts` and add a handler in `AcceptanceRunner.runSingleCheck`.

See [docs/acceptance-criteria.md](docs/acceptance-criteria.md).

## Cursor SDK integration

The orchestrator depends on the `AgentRunner` interface, not the SDK directly:

```typescript
import { Orchestrator, MockAgentRunner } from "cursor-orchestrator";

const orchestrator = new Orchestrator({
  agentRunner: new MockAgentRunner(), // or omit for CursorLocalRunner
  executionMode: "local",
});
```

- `cursorRunnerCore` + `composeAgentPrompt` — shared SDK lifecycle and prompt assembly
- `CursorLocalRunner` / `CursorCloudRunner` — thin adapters for local `cwd` vs cloud VM
- `AcceptanceGate` — unified acceptance evaluation with retries
- `NodeShellRunner` — PowerShell-first shell execution for acceptance checks

See [docs/architecture.md](docs/architecture.md).

## Development

```powershell
npm test
npm run build
npm run dev -- validate --workflow .\src\examples\generic-task.workflow.yaml
```

## Documentation

- [Architecture](docs/architecture.md)
- [Workflows](docs/workflows.md)
- [Agents](docs/agents.md)
- [Acceptance criteria](docs/acceptance-criteria.md)
- [Windows-first design](docs/windows-first.md)

## License

MIT
