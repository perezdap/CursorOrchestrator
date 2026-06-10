# Contributing to Cursor Orchestrator

Thank you for contributing. This project uses pull requests for all changes to `main`.

## Branch protection

`main` is protected by a GitHub ruleset:

- Changes must go through a **pull request** (no direct pushes).
- **Code owner review** is required (`@perezdap` via `.github/CODEOWNERS`).
- Force pushes and branch deletion are blocked.

The repository owner can **merge without an approval** via ruleset bypass (`pull_request` mode). That supports solo development while keeping a PR audit trail.

## Development setup

```powershell
git clone git@github.com:perezdap/CursorOrchestrator.git
cd CursorOrchestrator
npm install
npm run build
```

Optional — for live Cursor agent runs:

```powershell
$env:CURSOR_API_KEY = "cursor_..."
```

## Workflow for changes

```powershell
git checkout main
git pull origin main
git checkout -b feature/short-description

# make changes
npm run lint
npm test
npm run build

git add .
git commit -m "Brief summary of why, not just what"
git push -u origin feature/short-description

gh pr create --fill
gh pr merge --squash   # owner bypass skips approval requirement
```

Use descriptive branch names: `feature/…`, `fix/…`, `docs/…`.

## Commit messages

Write 1–2 sentences focused on **why** the change exists. Examples:

- `Add json_shape acceptance check for manifest validation`
- `Fix phase resume skipping failed acceptance retries`
- `Document AGENTS.md for AI contributor guidance`

Do not include AI attribution in commits or PR descriptions.

## Testing

```powershell
npm test               # all Vitest tests
npm run lint           # TypeScript type-check
npm run build          # compile check
```

When adding features:

- **Schemas** — add validation tests in `src/tests/*.schema.test.ts` or adjacent test files.
- **Orchestrator behavior** — test with `MockAgentRunner`, not live SDK calls.
- **Acceptance checks** — cover new check types in `acceptance-runner.test.ts`.

Validate example workflows still parse:

```powershell
npm run dev -- validate --workflow .\src\examples\generic-task.workflow.yaml
```

## Code style

- TypeScript strict mode; ESM with `.js` import extensions.
- Imports at the top of the file.
- Exhaustive `switch` defaults with `never` for discriminated unions.
- Keep changes focused — avoid drive-by refactors.

AI agents working in this repo should read [AGENTS.md](AGENTS.md) first.

## Documentation

Update docs when you change user-visible behavior:

| Change | Update |
|--------|--------|
| CLI commands or flags | README.md, docs/getting-started.md |
| Workflow schema | docs/workflows.md |
| Agent types | docs/agents.md, AGENTS.md |
| Acceptance check types | docs/acceptance-criteria.md |
| Architecture / extension points | docs/architecture.md, AGENTS.md |
| Domain terms | CONTEXT.md |

## Project layout for contributors

```text
src/agents/         Add agent types here
src/schemas/        Zod schemas — change first when extending models
src/orchestrator/   Core execution engine
src/runners/        Cursor SDK adapters and shell runner
src/policies/       Safety policies
src/tests/          Vitest tests
src/examples/       Reference workflow YAML
docs/               Deep-dive documentation
```

## Questions

Open an issue or discussion on GitHub for design questions before large changes.
