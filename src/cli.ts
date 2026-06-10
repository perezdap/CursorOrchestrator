#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { builtInAgentDefinitions } from "./agents/index.js";
import { formatInitSummary, initProject } from "./init/initProject.js";
import { Orchestrator } from "./orchestrator/Orchestrator.js";
import { ConsoleRunProgress, noopRunProgress } from "./orchestrator/RunProgress.js";
import { RunState } from "./orchestrator/RunState.js";
import { parseWorkflowFile } from "./schemas/workflow.schema.js";
import { resolveRunRepoUrl } from "./util/resolveRepoUrl.js";

const program = new Command();

program
  .name("orchestrator")
  .description("Cursor SDK-based agent orchestration framework")
  .version("0.1.0");

program
  .command("run")
  .description("Run a workflow")
  .requiredOption("-w, --workflow <path>", "Path to workflow YAML/JSON file")
  .option("-t, --task <task>", "Task description")
  .option("-r, --repo-path <path>", "Repository/workspace path", process.cwd())
  .option(
    "--repo-url <url>",
    "Git remote URL for cloud agents (auto-detected from origin when omitted)",
  )
  .option("-m, --execution-mode <mode>", "Execution mode: local or cloud", "local")
  .option("--run-id <id>", "Custom run ID")
  .option("--dry-run", "Validate and simulate without calling agents", false)
  .option("-q, --quiet", "Suppress progress output", false)
  .action(async (opts: {
    workflow: string;
    task?: string;
    repoPath: string;
    repoUrl?: string;
    executionMode: string;
    runId?: string;
    dryRun: boolean;
    quiet: boolean;
  }) => {
    const workflowPath = resolve(opts.workflow);
    if (!existsSync(workflowPath)) {
      console.error(`Workflow not found: ${workflowPath}`);
      process.exit(1);
    }

    const repoPath = resolve(opts.repoPath);
    const executionMode = opts.executionMode === "cloud" ? "cloud" : "local";
    const { repoUrl, source } = resolveRunRepoUrl({
      repoPath,
      executionMode,
      repoUrl: opts.repoUrl,
    });

    if (executionMode === "cloud" && !repoUrl) {
      console.error(
        "Cloud mode requires a Git repository URL. Pass --repo-url or run against a git clone with origin configured.",
      );
      process.exit(1);
    }

    if (repoUrl && !opts.quiet) {
      const via = source === "git" ? "auto-detected from origin" : "from --repo-url";
      console.error(`[orchestrator] Cloud repository (${via}): ${repoUrl}`);
    }

    const workflow = parseWorkflowFile(workflowPath);
    const orchestrator = new Orchestrator({
      cwd: repoPath,
      executionMode,
      dryRun: opts.dryRun,
      progress: opts.quiet ? noopRunProgress : new ConsoleRunProgress(),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: {
        task: opts.task,
        repoPath,
        repoUrl,
        executionMode,
      },
      runId: opts.runId,
    });

    console.log(`Run ID: ${result.runId}`);
    console.log(`Run directory: ${result.runDir}`);
    console.log(`Status: ${result.status}`);
    console.log(`Acceptance: ${result.acceptancePassed ? "passed" : "failed"}`);
    console.log(`Phases: ${result.phasesCompleted}/${result.phasesTotal}`);
    console.log(result.message);

    process.exit(result.status === "completed" ? 0 : 1);
  });

program
  .command("resume")
  .description("Resume a previous run")
  .requiredOption("--run-id <id>", "Run ID to resume")
  .option("-w, --workflow <path>", "Path to workflow file (optional if stored in run)")
  .option("-r, --repo-path <path>", "Repository path", process.cwd())
  .option("-q, --quiet", "Suppress progress output", false)
  .action(async (opts: { runId: string; workflow?: string; repoPath: string; quiet: boolean }) => {
    const cwd = resolve(opts.repoPath);
    const runDir = RunState.findRunDir(cwd, opts.runId);

    if (!existsSync(runDir)) {
      console.error(`Run not found: ${runDir}`);
      process.exit(1);
    }

    let workflow;
    if (opts.workflow) {
      workflow = parseWorkflowFile(resolve(opts.workflow));
    } else {
      const workflowPath = join(runDir, "workflow.yaml");
      if (!existsSync(workflowPath)) {
        console.error(`Workflow not found in run directory: ${workflowPath}`);
        process.exit(1);
      }
      workflow = parseWorkflowFile(workflowPath);
    }

    const state = RunState.load(runDir);
    const orchestrator = new Orchestrator({
      cwd,
      progress: opts.quiet ? noopRunProgress : new ConsoleRunProgress(),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: state.toJSON().inputs,
      runId: opts.runId,
      resume: true,
    });

    console.log(`Resumed run ${result.runId}: ${result.status}`);
    process.exit(result.status === "completed" ? 0 : 1);
  });

program
  .command("validate")
  .description("Validate a workflow file")
  .requiredOption("-w, --workflow <path>", "Path to workflow YAML/JSON file")
  .action((opts: { workflow: string }) => {
    const workflowPath = resolve(opts.workflow);
    try {
      const workflow = parseWorkflowFile(workflowPath);
      console.log(`Valid workflow: ${workflow.name}`);
      console.log(`  Phases: ${workflow.phases.length}`);
      console.log(`  Agents: ${Object.keys(workflow.agents).length}`);
      if (workflow.acceptance) {
        console.log(`  Acceptance criteria: ${workflow.acceptance.criteria.length}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("list-agents")
  .description("List built-in agent types")
  .action(() => {
    console.log("Built-in agent types:\n");
    for (const agent of builtInAgentDefinitions) {
      console.log(`  ${agent.type}`);
      console.log(`    Model: ${agent.model}`);
      console.log(`    Outputs: ${agent.outputs?.join(", ") ?? "(none)"}`);
      console.log("");
    }
  });

program
  .command("init")
  .description("Initialize orchestrator config in the current directory")
  .action(() => {
    const result = initProject(process.cwd(), import.meta.url);
    console.log(formatInitSummary(result));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
