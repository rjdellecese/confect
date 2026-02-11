import { FileSystem, Path } from "@effect/platform";
import { Effect, Ref, Schema } from "effect";
import { ConvexDirectory } from "./ConvexDirectory";

export class ConfectDirectory extends Effect.Service<ConfectDirectory>()(
  "@confect/cli/services/ConfectDirectory",
  {
    effect: Effect.gen(function* () {
      const convexDirectory = yield* findConfectDirectory;

      const ref = yield* Ref.make<string>(convexDirectory);

      return { get: Ref.get(ref) } as const;
    }),
    dependencies: [ConvexDirectory.Default],
    accessors: true,
  },
) {}

export class ConfectDirectoryNotFoundError extends Schema.TaggedError<ConfectDirectoryNotFoundError>(
  "ConfectDirectoryNotFoundError",
)("ConfectDirectoryNotFoundError", {}) {
  override get message(): string {
    return "Could not find Confect directory";
  }
}

export const findConfectDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const convexDirectory = yield* ConvexDirectory.get;

  const confectDirectory = path.join(path.dirname(convexDirectory), "confect");

  if (yield* fs.exists(confectDirectory)) {
    return confectDirectory;
  } else {
    return yield* Effect.fail(new ConfectDirectoryNotFoundError());
  }
});
