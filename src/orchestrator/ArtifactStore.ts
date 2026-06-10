import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { evaluateFileAccess } from "../policies/filePolicy.js";

export class ArtifactStore {
  constructor(
    private readonly runDir: string,
    private readonly workspaceRoot: string,
  ) {
    mkdirSync(this.artifactsDir, { recursive: true });
  }

  get artifactsDir(): string {
    return join(this.runDir, "artifacts");
  }

  writeArtifact(relativeName: string, content: string): string {
    const policy = evaluateFileAccess(
      join(this.artifactsDir, relativeName),
      this.workspaceRoot,
      "write",
    );
    if (policy.verdict === "block") {
      throw new Error(`Artifact write blocked: ${policy.reason}`);
    }

    const fullPath = join(this.artifactsDir, relativeName);
    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
    return fullPath;
  }

  readArtifact(relativeName: string): string {
    const fullPath = join(this.artifactsDir, relativeName);
    const policy = evaluateFileAccess(fullPath, this.workspaceRoot, "read");
    if (policy.verdict === "block") {
      throw new Error(`Artifact read blocked: ${policy.reason}`);
    }
    if (!existsSync(fullPath)) {
      throw new Error(`Artifact not found: ${relativeName}`);
    }
    return readFileSync(fullPath, "utf-8");
  }

  hasArtifact(relativeName: string): boolean {
    return existsSync(join(this.artifactsDir, relativeName));
  }

  copyExternalToArtifact(sourcePath: string, destName?: string): string {
    const policy = evaluateFileAccess(sourcePath, this.workspaceRoot, "read");
    if (policy.verdict === "block") {
      throw new Error(`External file copy blocked: ${policy.reason}`);
    }
    const name = destName ?? basename(sourcePath);
    const dest = join(this.artifactsDir, name);
    copyFileSync(sourcePath, dest);
    return dest;
  }

  listArtifacts(): string[] {
    if (!existsSync(this.artifactsDir)) return [];
    return readdirSync(this.artifactsDir, { recursive: true }).map(String);
  }
}
