# Agents

## Built-in agent types

| Type | Role |
|------|------|
| `planner` | Decompose tasks, produce plan and acceptance docs |
| `implementer` | Make focused code changes |
| `reviewer` | Code review for quality and requirements |
| `verifier` | Run checks against acceptance criteria |
| `researcher` | Gather and cite findings |
| `documenter` | Write developer/operator documentation |
| `security-reviewer` | Security-focused audit |
| `test-writer` | Add meaningful tests (Vitest, Pester) |
| `refactorer` | Structural improvements without behavior change |
| `release-manager` | Versioning, changelog, packaging notes |

List types:

```powershell
orchestrator list-agents
```

## Workflow agent configuration

Workflow YAML defines named agents that map to types:

```yaml
agents:
  planner:
    type: planner
    model: auto
    instructions: |
      Override default planner instructions here.
    allowedTools:
      - read
      - write
    executionMode: local
```

Workflow `instructions` override built-in defaults. Other fields fall back to the type module.

## Adding a new agent type

1. Create `src/agents/my-type.agent.ts`:

```typescript
import type { AgentTypeModule } from "./types.js";

export const myTypeAgent: AgentTypeModule = {
  type: "my-type", // extend agentTypeSchema enum first
  defaultInstructions: "You are a specialist for ...",
  outputs: ["result.md"],
};
```

2. Add the type to `agentTypeSchema` in `src/schemas/agent.schema.ts`
3. Export from `src/agents/index.ts` and add to `builtInAgentModules`

No orchestrator changes required.

## Execution modes

| Mode | Runner |
|------|--------|
| `local` | `CursorLocalRunner` — uses machine `cwd` |
| `cloud` | `CursorCloudRunner` — Cursor-hosted VM |
| `auto` | Follows workflow/run `executionMode` default |

## Agent messages and artifacts

Each phase stores:

- `.runs/<id>/agent-messages/<phase-id>.md`
- `.runs/<id>/artifacts/<phase-id>-output.md`
- Declared `outputs` from the phase definition
