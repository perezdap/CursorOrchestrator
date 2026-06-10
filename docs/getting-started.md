# Getting Started

Run your first workflow in a few minutes on Windows.

## Prerequisites

- **Node.js 20+**
- **PowerShell 7+** (`pwsh`) — recommended on Windows
- **Git**
- **Cursor API key** — only for live agent runs (optional for validation and dry runs)

## Install

```powershell
git clone git@github.com:perezdap/CursorOrchestrator.git
cd CursorOrchestrator
npm install
npm run build
```

Link the CLI globally (optional):

```powershell
npm link
```

## Configure Cursor (live runs only)

```powershell
$env:CURSOR_API_KEY = "cursor_..."
```

Without an API key you can still validate workflows and run with `--dry-run`.

## Initialize a project

From the **repository root** (not from inside `.orchestrator/`):

```powershell
orchestrator init
```

Creates:

```text
.orchestrator/
  config.yaml       # Defaults for this repo
  README.md         # Layout and next steps
workflows/
  generic-task.workflow.yaml
  winget-psadt-package.workflow.yaml
.runs/              # Run artifacts (gitignore recommended)
```

Validate and run the starter workflow:

```powershell
orchestrator validate --workflow .\workflows\generic-task.workflow.yaml

orchestrator run `
  --workflow .\workflows\generic-task.workflow.yaml `
  --task "Your task" `
  --repo-path .
```

## Validate an example workflow

```powershell
orchestrator validate --workflow .\src\examples\generic-task.workflow.yaml
```

Validation checks schema shape, agent references, phase dependencies, and cycles.

## Dry run (no API calls)

Simulate execution without calling Cursor agents:

```powershell
orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add a hello world test" `
  --repo-path . `
  --dry-run
```

## Live run

```powershell
orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add a hello world test" `
  --repo-path .
```

Progress prints to stderr:

```text
[orchestrator] [1/4] Phase intake … running
[orchestrator] [1/4] Phase intake … completed
...
```

On completion, inspect artifacts:

```powershell
Get-ChildItem .\.runs\
```

Each run folder contains `state.json`, `phase-log.md`, `artifacts/`, and acceptance reports.

## Resume a failed run

```powershell
orchestrator resume --run-id <id> --repo-path .
```

Completed phases are skipped; pending work continues from `state.json`.

## List built-in agents

```powershell
orchestrator list-agents
```

## Create your own workflow

1. Copy `src/examples/generic-task.workflow.yaml` to `workflows/my-task.workflow.yaml`.
2. Adjust agents, phases, and acceptance criteria.
3. Validate, then run:

```powershell
orchestrator validate --workflow .\workflows\my-task.workflow.yaml

orchestrator run `
  --workflow .\workflows\my-task.workflow.yaml `
  --task "Your task description" `
  --repo-path C:\path\to\target-repo
```

See [workflows.md](workflows.md) for the full schema.

## Next steps

- [workflows.md](workflows.md) — phase fields, dependencies, acceptance
- [agents.md](agents.md) — configure agent types and overrides
- [acceptance-criteria.md](acceptance-criteria.md) — verifiable completion checks
- [architecture.md](architecture.md) — how the framework fits together
- [../AGENTS.md](../AGENTS.md) — contributing and extending the framework
