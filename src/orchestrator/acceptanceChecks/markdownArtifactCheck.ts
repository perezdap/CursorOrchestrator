import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

export const markdownArtifactCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "markdown_artifact" }>
> = {
  type: "markdown_artifact",
  run(check, ctx, base) {
    const searchPaths = [
      resolve(ctx.cwd, check.path),
      ctx.artifactsDir ? join(ctx.artifactsDir, check.path) : undefined,
    ].filter(Boolean) as string[];

    for (const fullPath of searchPaths) {
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf-8");
        const minLength = check.minLength ?? 1;
        const valid = content.trim().length >= minLength;
        return {
          ...base,
          passed: valid,
          message: valid
            ? `Markdown artifact found: ${check.path}`
            : `Markdown artifact too short: ${check.path}`,
        };
      }
    }

    return {
      ...base,
      passed: false,
      message: `Markdown artifact not found: ${check.path}`,
    };
  },
};
