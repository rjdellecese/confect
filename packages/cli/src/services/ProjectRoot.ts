import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Array, Effect, Option, Ref, Schema } from "effect";

export class ProjectRoot extends Effect.Service<ProjectRoot>()(
  "@confect/cli/services/ProjectRoot",
  {
    effect: Effect.gen(function* () {
      const projectRoot = yield* findProjectRoot;

      const ref = yield* Ref.make<string>(projectRoot);

      return { get: Ref.get(ref) } as const;
    }),
    dependencies: [NodeFileSystem.layer],
    accessors: true,
  },
) {}

export const findProjectRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const startDir = path.resolve(".");
  const root = path.parse(startDir).root;

  const directories = Array.unfold(startDir, (dir) =>
    dir === root
      ? Option.none()
      : Option.some([dir, path.dirname(dir)] as const),
  );

  const projectRoot = yield* Effect.findFirst(directories, (dir) =>
    fs.exists(path.join(dir, "package.json")),
  );

  return yield* Option.match(projectRoot, {
    onNone: () => Effect.fail(new ProjectRootNotFoundError()),
    onSome: Effect.succeed,
  });
});

export class ProjectRootNotFoundError extends Schema.TaggedError<ProjectRootNotFoundError>(
  "ProjectRootNotFoundError",
)("ProjectRootNotFoundError", {}) {
  override get message(): string {
    return "Could not find project root (no 'package.json' found)";
  }
}
