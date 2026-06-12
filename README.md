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

Creates `.orchestrator/config.yaml`, `.orchestrator/README.md`, `workflows/generic-task.workflow.yaml`, and `.runs/`.

Run from the **repository root**, not from inside `.orchestrator/`.

## Create a workflow

`init` seeds one starter template. To add workflows for your project:

1. Copy the starter and rename it:

```powershell
Copy-Item .\workflows\generic-task.workflow.yaml .\workflows\my-task.workflow.yaml
```

2. Edit agents, phases, dependencies, and acceptance criteria in the new file.

3. Validate before running:

```powershell
orchestrator validate --workflow .\workflows\my-task.workflow.yaml
```

See [docs/workflows.md](docs/workflows.md) for the full schema and the [example workflow catalog](docs/workflows.md#example-workflows).

Bundled templates live under `src/examples/` in this repo, or `node_modules/cursor-orchestrator/src/examples/` when installed as a package.

Validate any example before running:

```powershell
orchestrator validate --workflow .\src\examples\tdd-feature.workflow.yaml
```

To use one as a starting point for your own workflow:

```powershell
Copy-Item .\src\examples\tdd-feature.workflow.yaml .\workflows\my-feature.workflow.yaml
```

When using the installed package, substitute the `node_modules/cursor-orchestrator/src/examples/` path.

## Run a workflow

```powershell
orchestrator validate --workflow .\src\examples\generic-task.workflow.yaml

orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add unit tests" `
  --repo-path .
```

Progress lines print to stderr by default (`[orchestrator] [1/4] Phase intake … running`). Use `--quiet` to suppress them.

### Execution modes

| Mode | Flag | Agent runs on | Source of truth for agent work |
|------|------|---------------|--------------------------------|
| **Local** (default) | `--execution-mode local` | Your machine (`--repo-path`) | Local checkout |
| **Cloud** | `--execution-mode cloud` | Cursor-hosted VM | GitHub repo (`--repo-url` or auto-detected `origin`) |

In **cloud** mode, agents clone and edit the remote GitHub repository—not your local folder. Push your branch before running; pull locally before acceptance checks pass. Acceptance checks (`npm test`, Pester, etc.) always run against `--repo-path`.

```powershell
# Local (default) — best for sensitive or uncommitted work
orchestrator run --workflow .\workflows\my-task.workflow.yaml --task "..." --repo-path .

# Cloud — best when work is on GitHub and you want remote agent compute
orchestrator run `
  --workflow .\workflows\my-task.workflow.yaml `
  --task "..." `
  --repo-path . `
  --execution-mode cloud
```

Use `--dry-run` or `MockAgentRunner` in CI when you should not call the Cursor API. See [Cloud execution](docs/getting-started.md#cloud-execution) for setup and [Security](docs/security.md) for threat model and operator guidance.

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

- [Getting started](docs/getting-started.md) — first workflow run
- [AGENTS.md](AGENTS.md) — guide for AI agents and contributors
- [Contributing](CONTRIBUTING.md) — dev setup and PR workflow
- [Documentation index](docs/README.md)

**Deep dives**

- [Architecture](docs/architecture.md)
- [Security](docs/security.md) — cloud threat model, policies, execution mode guidance
- [Workflows](docs/workflows.md)
- [Agents](docs/agents.md)
- [Acceptance criteria](docs/acceptance-criteria.md)
- [Windows-first design](docs/windows-first.md)
- [Domain glossary](CONTEXT.md)

## License

MIT
