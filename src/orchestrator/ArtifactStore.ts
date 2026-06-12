import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { defaultPolicyGate } from "../policies/PolicyGate.js";
import { redactSecrets } from "../policies/redactionPolicy.js";

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
    defaultPolicyGate.enforceFileAccess(
      join(this.artifactsDir, relativeName),
      this.workspaceRoot,
      "write",
      "Artifact write blocked",
    );

    const fullPath = join(this.artifactsDir, relativeName);
    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, redactSecrets(content), "utf-8");
    return fullPath;
  }

  readArtifact(relativeName: string): string {
    const fullPath = join(this.artifactsDir, relativeName);
    defaultPolicyGate.enforceFileAccess(
      fullPath,
      this.workspaceRoot,
      "read",
      "Artifact read blocked",
    );
    if (!existsSync(fullPath)) {
      throw new Error(`Artifact not found: ${relativeName}`);
    }
    return readFileSync(fullPath, "utf-8");
  }

  hasArtifact(relativeName: string): boolean {
    return existsSync(join(this.artifactsDir, relativeName));
  }

  copyExternalToArtifact(sourcePath: string, destName?: string): string {
    defaultPolicyGate.enforceFileAccess(
      sourcePath,
      this.workspaceRoot,
      "read",
      "External file copy blocked",
    );
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
