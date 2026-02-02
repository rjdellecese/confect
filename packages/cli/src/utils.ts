import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Option, Schema, String } from "effect";
import * as templates from "./templates";

export const removePathExtension = (pathStr: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return String.slice(0, -path.extname(pathStr).length)(pathStr);
  });

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

  return Option.getOrElse(projectRoot, () => startDir);
});

export const findConfectDirectory = ({
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

// TODO: Only find, don't create. Tell the user to initialize the project using the Convex CLI (`convex dev`) if the `convex` directory doesn't exist.
/**
 * Returns the path to the Convex directory and creates it if it doesn't exist.
 */
export const findAndCreateConvexDirectory = ({
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

export const generateFunctionModule = ({
  confectDirectory,
  convexDirectory,
  dirs,
  mod,
  fns,
}: {
  confectDirectory: string;
  convexDirectory: string;
  dirs: string[];
  mod: string;
  fns: string[];
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const directoryPath = path.join(convexDirectory, ...dirs);
    if (!(yield* fs.exists(directoryPath))) {
      yield* fs.makeDirectory(directoryPath, { recursive: true });
    }

    const modulePath = path.join(directoryPath, `${mod}.ts`);

    const registeredFunctionsPath = path.join(
      confectDirectory,
      "_generated",
      "registeredFunctions.ts",
    );
    const registeredFunctionsImportPath = yield* removePathExtension(
      path.relative(path.dirname(modulePath), registeredFunctionsPath),
    );

    const functionsContentsString = yield* templates.functions({
      dirs,
      mod,
      fns,
      registeredFunctionsImportPath,
    });

    const moduleContents = new TextEncoder().encode(functionsContentsString);
    yield* fs.writeFile(modulePath, moduleContents);
  });
