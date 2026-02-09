import { FileSystem, Path } from "@effect/platform";
import { Effect, Option, Ref, Schema } from "effect";
import { ProjectRoot } from "./ProjectRoot";

export class ConvexDirectory extends Effect.Service<ConvexDirectory>()(
  "@confect/cli/services/ConvexDirectory",
  {
    effect: Effect.gen(function* () {
      const convexDirectory = yield* findConvexDirectory;

      const ref = yield* Ref.make<string>(convexDirectory);

      return { get: Ref.get(ref) } as const;
    }),
    dependencies: [ProjectRoot.Default],
    accessors: true,
  },
) {}

export class ConvexDirectoryNotFoundError extends Schema.TaggedError<ConvexDirectoryNotFoundError>(
  "ConvexDirectoryNotFoundError",
)("ConvexDirectoryNotFoundError", {}) {
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

const findConvexDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const projectRoot = yield* ProjectRoot.get;

  const defaultPath = path.join(projectRoot, "convex");

  const convexJsonPath = path.join(projectRoot, "convex.json");

  const convexDirectory = yield* Effect.if(fs.exists(convexJsonPath), {
    onTrue: () =>
      fs.readFileString(convexJsonPath).pipe(
        Effect.andThen(Schema.decodeOption(ConvexJsonConfig)),
        Effect.map((config) =>
          Option.fromNullable(config.functions).pipe(
            Option.map((functionsDir) => path.join(projectRoot, functionsDir)),
          ),
        ),
        Effect.andThen(Option.getOrElse(() => defaultPath)),
      ),
    onFalse: () => Effect.succeed(defaultPath),
  });

  if (yield* fs.exists(convexDirectory)) {
    return convexDirectory;
  } else {
    return yield* Effect.fail(new ConvexDirectoryNotFoundError());
  }
});
