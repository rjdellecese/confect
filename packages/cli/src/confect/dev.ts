import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Option, Schema } from "effect";

export const codegen = Command.make("dev", {}, () =>
  Effect.gen(function* () {
    const projectRoot = yield* findProjectRoot;
    const convexDirectory = yield* findAndCreateConvexDirectory({
      projectRoot,
    });
    const confectDirectory = yield* findConfectDirectory({ convexDirectory });

    const fs = yield* FileSystem.FileSystem;

    const stream = fs.watch(confectDirectory, { recursive: true });
  }),
).pipe(Command.withDescription("Start the Confect development server"));

// TODO: Dedupe this and other helper functions
const findProjectRoot = Effect.gen(function* () {
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

  return Option.getOrElse(projectRoot, () => startDir);
});

const findConfectDirectory = ({
  convexDirectory,
}: {
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return path.join(convexDirectory, "..", "confect");
  });

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
 * Returns the path to the Convex directory and creates it if it doesn't exist.
 */
const findAndCreateConvexDirectory = ({
  projectRoot,
}: {
  projectRoot: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const defaultPath = path.join(projectRoot, "convex");

    const convexJsonPath = path.join(projectRoot, "convex.json");

    const convexDirectory = yield* Effect.if(fs.exists(convexJsonPath), {
      onTrue: () =>
        fs.readFileString(convexJsonPath).pipe(
          Effect.andThen(Schema.decodeOption(ConvexJsonConfig)),
          Effect.map((config) =>
            Option.fromNullable(config.functions).pipe(
              Option.map((functionsDir) =>
                path.join(projectRoot, functionsDir),
              ),
            ),
          ),
          Effect.andThen(Option.getOrElse(() => defaultPath)),
        ),
      onFalse: () => Effect.succeed(defaultPath),
    });

    if (!(yield* fs.exists(convexDirectory))) {
      yield* fs.makeDirectory(convexDirectory, { recursive: true });
    }

    return convexDirectory;
  });
