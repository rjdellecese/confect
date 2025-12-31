import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import {
  Array,
  Config,
  Console,
  Effect,
  Option,
  Record,
  Schema,
  String,
} from "effect";
import * as tsx from "tsx/esm/api";
import packageJson from "../../package.json" with { type: "json" };
import { forEachBranchLeaves } from "../internal/utils";
import * as ConfectApiServer from "../server/ConfectApiServer";
import * as ConfectSchema from "../server/ConfectSchema";
import * as templates from "./templates";

const codegenCommand = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    const projectRoot = yield* findProjectRoot;
    const confectDirectory = yield* findConfectDirectory({ projectRoot });
    const convexDirectory = yield* findAndCreateConvexDirectory({
      projectRoot,
    });

    yield* generateConfectGeneratedDirectory({ confectDirectory });
    yield* Effect.all(
      [
        generateApi({ confectDirectory }),
        generateRefs({ confectDirectory }),
        generateServices({ confectDirectory }),
      ],
      { concurrency: "unbounded" },
    );
    yield* Effect.all(
      [
        generateSchema({ confectDirectory, convexDirectory }),
        generateFunctions({ confectDirectory, convexDirectory }),
        generateHttp({ confectDirectory, convexDirectory }),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Generate Convex functions from a Confect API"));

const generateConfectGeneratedDirectory = ({
  confectDirectory,
}: {
  confectDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    if (!(yield* fs.exists(path.join(confectDirectory, "_generated")))) {
      yield* fs.makeDirectory(path.join(confectDirectory, "_generated"), {
        recursive: true,
      });
    }
  });

const generateApi = ({ confectDirectory }: { confectDirectory: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const apiPath = path.join(confectDirectory, "_generated", "api.ts");
    const apiContents = yield* templates.api({
      schemaImportPath: yield* removePathExtension(
        path.relative(
          path.dirname(apiPath),
          path.join(confectDirectory, "schema.ts"),
        ),
      ),
      specImportPath: yield* removePathExtension(
        path.relative(
          path.dirname(apiPath),
          path.join(confectDirectory, "spec.ts"),
        ),
      ),
    });

    yield* fs.writeFileString(apiPath, apiContents);
  });

const generateFunctions = ({
  confectDirectory,
  convexDirectory,
}: {
  confectDirectory: string;
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const serverPath = path.join(confectDirectory, "server.ts");
    const serverUrl = yield* path.toFileUrl(serverPath);

    const server = yield* Effect.promise(() =>
      tsx.tsImport(serverUrl.href, import.meta.url),
    ).pipe(
      Effect.andThen((serverModule) => {
        const defaultExport = serverModule.default;

        return ConfectApiServer.isConfectApiServer(defaultExport)
          ? Effect.succeed(defaultExport)
          : Effect.die("Invalid server module");
      }),
    );

    yield* forEachBranchLeaves<
      ConfectApiServer.RegisteredFunction,
      void,
      Error,
      FileSystem.FileSystem | Path.Path
    >(
      server.registeredFunctions,
      ConfectApiServer.isRegisteredFunction,
      (registeredFunction) =>
        Effect.gen(function* () {
          const mod = Array.last(registeredFunction.path).pipe(
            Option.getOrThrowWith(
              () => new Error("Missing module name in function path"),
            ),
          );
          const dirs = Array.init(registeredFunction.path).pipe(
            Option.getOrThrowWith(
              () => new Error("Missing directory names in function path"),
            ),
          );
          const fns = Record.keys(registeredFunction.values);

          yield* generateFunctionModule({
            confectDirectory,
            convexDirectory,
            dirs,
            mod,
            fns,
          });
        }),
    );
  });

const generateSchema = ({
  confectDirectory,
  convexDirectory,
}: {
  confectDirectory: string;
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectSchemaPath = path.join(confectDirectory, "schema.ts");
    const confectSchemaUrl = yield* path.toFileUrl(confectSchemaPath);

    yield* Effect.promise(() =>
      tsx.tsImport(confectSchemaUrl.href, import.meta.url),
    ).pipe(
      Effect.andThen((schemaModule) => {
        const defaultExport = schemaModule.default;

        return ConfectSchema.isConfectSchema(defaultExport)
          ? Effect.succeed(defaultExport)
          : Effect.die("Invalid schema module");
      }),
    );

    const convexSchemaPath = path.join(convexDirectory, "schema.ts");

    const relativeImportPath = path.relative(
      path.dirname(convexSchemaPath),
      confectSchemaPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const schemaContents = yield* templates.schema({
      schemaImportPath: importPathWithoutExt,
    });

    yield* fs.writeFileString(convexSchemaPath, schemaContents);
  });

const generateFunctionModule = ({
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

    const serverPath = path.join(confectDirectory, "server.ts");
    const serverImportPath = yield* removePathExtension(
      path.relative(path.dirname(modulePath), serverPath),
    );

    const functionsContentsString = yield* templates.functions({
      dirs,
      mod,
      fns,
      serverImportPath,
    });

    const moduleContents = new TextEncoder().encode(functionsContentsString);
    yield* fs.writeFile(modulePath, moduleContents);
  });

const generateServices = ({ confectDirectory }: { confectDirectory: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // TODO: Is this the right approach?
    const test = yield* Config.boolean("CONFECT_TEST").pipe(
      Config.withDefault(false),
    );

    const confectGeneratedDirectory = path.join(confectDirectory, "_generated");

    const servicesPath = path.join(confectGeneratedDirectory, "services.ts");
    const schemaImportPath = path.relative(
      path.dirname(servicesPath),
      path.join(confectDirectory, "schema"),
    );

    const servicesContentsString = yield* templates.services({
      schemaImportPath,
      test,
    });

    const servicesContents = new TextEncoder().encode(servicesContentsString);
    yield* fs.writeFile(servicesPath, servicesContents);
  });

const generateHttp = ({
  confectDirectory,
  convexDirectory,
}: {
  confectDirectory: string;
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectHttpPath = path.join(confectDirectory, "http.ts");

    if (yield* fs.exists(confectHttpPath)) {
      const convexHttpPath = path.join(convexDirectory, "http.ts");

      const relativeImportPath = path.relative(
        path.dirname(convexHttpPath),
        confectHttpPath,
      );
      const importPathWithoutExt =
        yield* removePathExtension(relativeImportPath);
      const httpContents = yield* templates.http({
        httpImportPath: importPathWithoutExt,
      });

      yield* fs.writeFileString(convexHttpPath, httpContents);
    } else {
      yield* Console.debug("No http.ts file found, skipping…");
    }
  });

const generateRefs = ({ confectDirectory }: { confectDirectory: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectGeneratedDirectory = path.join(confectDirectory, "_generated");

    const confectSpecPath = path.join(confectDirectory, "spec.ts");
    const refsPath = path.join(confectGeneratedDirectory, "refs.ts");

    const relativeImportPath = path.relative(
      path.dirname(refsPath),
      confectSpecPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const refsContents = yield* templates.refs({
      specImportPath: importPathWithoutExt,
    });

    yield* fs.writeFileString(refsPath, refsContents);
  });

const removePathExtension = (pathStr: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return String.slice(0, -path.extname(pathStr).length)(pathStr);
  });

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

const findConfectDirectory = ({ projectRoot }: { projectRoot: string }) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return path.join(projectRoot, "confect");
  });

// Schema for `convex.json` configuration file
// See: https://docs.convex.dev/production/project-configuration
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

/**
 * The main CLI command with all subcommands.
 */
export const confect = Command.make("confect").pipe(
  Command.withDescription("Confect - Use Effect with Convex!"),
  Command.withSubcommands([codegenCommand]),
);

/**
 * The CLI application runner.
 */
export const cli = Command.run(confect, {
  name: "Confect",
  version: packageJson.version,
});
