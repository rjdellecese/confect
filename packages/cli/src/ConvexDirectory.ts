import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Option, Ref, Schema } from "effect";

export class ConvexDirectory extends Effect.Service<ConvexDirectory>()(
  "@confect/cli/ConvexDirectory",
  {
    effect: Effect.gen(function* () {
      const convexDirectory = yield* findConvexDirectory;

      const ref = yield* Ref.make<string>(convexDirectory);

      return { get: Ref.get(ref) } as const;
    }),
    accessors: true,
  },
) {}

export class ConvexDirectoryNotFoundError extends Schema.TaggedError<ConvexDirectoryNotFoundError>()(
  "ConvexDirectoryNotFoundError",
  {},
) {
  override get message(): string {
    return "Could not find Convex directory";
  }
}

/**
 * Schema for `convex.json` configuration file.
 * @see https://docs.convex.dev/production/project-configuration
 */
const ConvexJsonConfig = Schema.parseJson(
  Schema.Struct({
    functions: Schema.optional(Schema.String),
  }),
);

/**
 * Walk up from the current working directory looking for the nearest
 * `convex.json`. When found, the Convex functions directory is resolved
 * relative to the directory containing that `convex.json` (per its
 * `functions` field, defaulting to `./convex/`). When no `convex.json`
 * exists on the path, fall back to `<cwd>/convex/` if that directory
 * exists; otherwise fail.
 *
 * Resolving from CWD (rather than from the nearest `package.json`) lets
 * a single package host multiple Convex projects side-by-side, by giving
 * each its own `convex.json` and invoking the CLI from inside that
 * project's directory.
 */
export const findConvexDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const startDir = path.resolve(".");
  const root = path.parse(startDir).root;

  const directories = Array.unfold(startDir, (dir) =>
    dir === root
      ? Option.none()
      : Option.some([dir, path.dirname(dir)] as const),
  );

  const convexJsonDir = yield* Effect.findFirst(directories, (dir) =>
    fs.exists(path.join(dir, "convex.json")),
  );

  const convexDirectory = yield* Option.match(convexJsonDir, {
    onSome: (dir) =>
      Effect.gen(function* () {
        const convexJsonPath = path.join(dir, "convex.json");
        const config = yield* fs
          .readFileString(convexJsonPath)
          .pipe(Effect.andThen(Schema.decodeOption(ConvexJsonConfig)));
        return Option.fromNullable(config.functions).pipe(
          Option.map((functionsDir) => path.resolve(dir, functionsDir)),
          Option.getOrElse(() => path.join(dir, "convex")),
        );
      }),
    onNone: () => Effect.succeed(path.join(startDir, "convex")),
  });

  if (yield* fs.exists(convexDirectory)) {
    return convexDirectory;
  } else {
    return yield* new ConvexDirectoryNotFoundError();
  }
});
