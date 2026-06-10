import { execFileSync } from "node:child_process";

export function normalizeGitRemoteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  const scpMatch = /^git@([^:]+):(.+?)(?:\.git)?$/i.exec(trimmed);
  if (scpMatch) {
    return `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  const sshUrlMatch = /^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\.git$/i, "");
  }

  return trimmed;
}

export function detectGitRemoteUrl(
  repoPath: string,
  remote = "origin",
): string | undefined {
  try {
    const output = execFileSync(
      "git",
      ["-C", repoPath, "remote", "get-url", remote],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const url = output.trim();
    return url ? normalizeGitRemoteUrl(url) : undefined;
  } catch {
    return undefined;
  }
}

export interface ResolveRunRepoUrlOptions {
  repoPath: string;
  executionMode: "local" | "cloud";
  repoUrl?: string;
}

export interface ResolveRunRepoUrlResult {
  repoUrl?: string;
  source?: "flag" | "git";
}

export function resolveRunRepoUrl(
  options: ResolveRunRepoUrlOptions,
): ResolveRunRepoUrlResult {
  if (options.repoUrl?.trim()) {
    return {
      repoUrl: normalizeGitRemoteUrl(options.repoUrl),
      source: "flag",
    };
  }

  if (options.executionMode === "cloud") {
    const detected = detectGitRemoteUrl(options.repoPath);
    if (detected) {
      return { repoUrl: detected, source: "git" };
    }
  }

  return {};
}
