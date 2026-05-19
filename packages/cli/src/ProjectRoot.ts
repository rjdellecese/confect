/**
 * Project-root discovery: walks up from `cwd` to find the nearest directory
 * containing a `package.json`.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Fs from "./internal/fs";
import * as Path from "./internal/path";

export class ProjectRootNotFoundError extends Schema.TaggedErrorClass<ProjectRootNotFoundError>()(
  "ProjectRootNotFoundError",
  {},
) {
  get message(): string {
    return "Could not find project root (no 'package.json' found)";
  }
}

/**
 * Resolve the project root by walking up from `cwd` until a `package.json`
 * is found, returning its containing directory.
 */
export const findProjectRoot: Effect.Effect<string, ProjectRootNotFoundError> =
  Effect.gen(function* () {
    const startDir = Path.resolve(".");
    const root = Path.parse(startDir).root;

    let current = startDir;
    while (current !== root) {
      if (yield* Fs.exists(Path.join(current, "package.json"))) {
        return current;
      }
      const parent = Path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return yield* new ProjectRootNotFoundError();
  });
