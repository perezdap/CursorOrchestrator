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

## Cloud execution

Cloud agents run on Cursor-hosted VMs against a **GitHub repository**, not your local `--repo-path` folder. Acceptance checks (`dotnet test`, `npm test`, etc.) still run locally against `--repo-path`.

```powershell
orchestrator run `
  --workflow .\workflows\dotnet-task.workflow.yaml `
  --task "Add CLI parsing tests" `
  --repo-path C:\path\to\your\repo `
  --execution-mode cloud
```

When `--execution-mode cloud` is set:

- **`--repo-url`** — optional explicit Git remote (HTTPS or SSH). Normalized to HTTPS for the Cursor SDK.
- **Auto-detect** — if `--repo-url` is omitted, the CLI reads `git remote get-url origin` from `--repo-path` and converts `git@github.com:org/repo.git` to `https://github.com/org/repo`.
- **Failure** — cloud mode exits early if no URL can be resolved.

Push your branch before a cloud run so agents work against the latest remote state, then pull locally before acceptance passes.

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

To add more workflows, copy `workflows/generic-task.workflow.yaml`, edit the copy, and validate it. See [workflows.md](workflows.md) for the schema and [README.md](../README.md#create-a-workflow) for examples you can copy from the package.

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

1. Copy `workflows/generic-task.workflow.yaml` to `workflows/my-task.workflow.yaml`.
2. Adjust agents, phases, and acceptance criteria.
3. Validate, then run:

```powershell
orchestrator validate --workflow .\workflows\my-task.workflow.yaml

orchestrator run `
  --workflow .\workflows\my-task.workflow.yaml `
  --task "Your task description" `
  --repo-path .
```

See [workflows.md](workflows.md) for the full schema. For specialized templates (Windows packaging, repo review), copy from `node_modules/cursor-orchestrator/src/examples/`.

## Next steps

- [workflows.md](workflows.md) — phase fields, dependencies, acceptance
- [agents.md](agents.md) — configure agent types and overrides
- [acceptance-criteria.md](acceptance-criteria.md) — verifiable completion checks
- [architecture.md](architecture.md) — how the framework fits together
- [../AGENTS.md](../AGENTS.md) — contributing and extending the framework
