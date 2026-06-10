import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

export const fileContainsCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "file_contains" }>
> = {
  type: "file_contains",
  run(check, ctx, base) {
    const fullPath = resolve(ctx.cwd, check.path);
    if (!existsSync(fullPath)) {
      return { ...base, passed: false, message: `File not found: ${check.path}` };
    }
    const content = readFileSync(fullPath, "utf-8");
    const regex = new RegExp(check.pattern, check.flags);
    const found = regex.test(content);
    return {
      ...base,
      passed: found,
      message: found
        ? `Pattern found in ${check.path}`
        : `Pattern not found in ${check.path}`,
    };
  },
};
