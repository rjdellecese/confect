/**
 * Confect directory discovery: returns `<projectRoot>/confect`, or fails if
 * the directory doesn't exist next to the Convex directory.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { findConvexDirectory } from "./ConvexDirectory";
import * as Fs from "./internal/fs";
import * as Path from "./internal/path";

export class ConfectDirectoryNotFoundError extends Schema.TaggedErrorClass<ConfectDirectoryNotFoundError>()(
  "ConfectDirectoryNotFoundError",
  {},
) {
  get message(): string {
    return "Could not find Confect directory";
  }
}

export const findConfectDirectory = Effect.gen(function* () {
  const convexDirectory = yield* findConvexDirectory;
  const confectDirectory = Path.join(Path.dirname(convexDirectory), "confect");

  if (yield* Fs.exists(confectDirectory)) {
    return confectDirectory;
  }
  return yield* new ConfectDirectoryNotFoundError();
});
