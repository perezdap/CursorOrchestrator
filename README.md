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

See [docs/workflows.md](docs/workflows.md) for the full schema.

## Example workflows

`src/examples/` ships 10 ready-to-use workflow templates:

| File | Use case |
|------|----------|
| `generic-task.workflow.yaml` | Plan → implement → review → verify |
| `bug-fix.workflow.yaml` | Diagnose, fix, test, and verify a reported bug |
| `new-react-component.workflow.yaml` | Design, implement, test, and document a React component |
| `tdd-feature.workflow.yaml` | TDD flow: test-writer runs before implementer |
| `safe-refactor.workflow.yaml` | Behaviour-preserving refactor with review gates |
| `project-setup.workflow.yaml` | Scaffold, CI, tests, and docs for a new project |
| `security-audit.workflow.yaml` | Dependency scan, static audit, remediation, report |
| `api-integration.workflow.yaml` | Plan, implement, test, review, and document an API client |
| `winget-psadt-package.workflow.yaml` | Windows packaging with Pester |
| `repo-review.workflow.yaml` | Research and review pipeline |

Validate any example before running:

```powershell
orchestrator validate --workflow .\src\examples\tdd-feature.workflow.yaml
```

To use one as a starting point for your own workflow:

```powershell
Copy-Item .\src\examples\tdd-feature.workflow.yaml .\workflows\my-feature.workflow.yaml
```

## Run a workflow

```powershell
orchestrator validate --workflow .\src\examples\generic-task.workflow.yaml

orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add unit tests" `
  --repo-path .
```

Progress lines print to stderr by default (`[orchestrator] [1/4] Phase intake … running`). Use `--quiet` to suppress them.

Cloud agents run against a **GitHub** repository URL (`--repo-url` or auto-detected `origin`), not your local folder. Acceptance checks still use `--repo-path`. See [Cloud execution](docs/getting-started.md#cloud-execution).

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
- [Workflows](docs/workflows.md)
- [Agents](docs/agents.md)
- [Acceptance criteria](docs/acceptance-criteria.md)
- [Windows-first design](docs/windows-first.md)
- [Domain glossary](CONTEXT.md)

## License

MIT
