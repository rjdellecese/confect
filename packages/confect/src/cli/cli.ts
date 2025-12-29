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
import * as ConfectApiServer from "../server/ConfectApiServer";
import * as ConfectSchema from "../server/ConfectSchema";
import { forEachBranchLeaves } from "../internal/utils";
import { functions, http, refs, schema, services } from "./templates";

const codegenCommand = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    yield* generateConfectDirectory;
    yield* generateConfectGeneratedDirectory;
    yield* generateConvexConfectDirectory;
    yield* generateSchema;
    yield* generateServices;
    yield* generateHttp;
    yield* generateRefs;
    yield* generateFunctions;
  }),
).pipe(Command.withDescription("Generate Convex functions from a Confect API"));

const generateConfectDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;

  const confectDirectory = yield* findConfectDirectory;

  yield* fs.makeDirectory(confectDirectory, { recursive: true });
});

const generateConfectGeneratedDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const confectDirectory = yield* findConvexConfectDirectory;

  yield* fs.makeDirectory(path.join(confectDirectory, "_generated"), {
    recursive: true,
  });
});

const generateConvexConfectDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const convexDirectory = yield* findConvexDirectory;

  yield* fs.makeDirectory(path.join(convexDirectory, "confect"), {
    recursive: true,
  });
});

const generateFunctions = Effect.gen(function* () {
  const path = yield* Path.Path;

  const confectDirectory = yield* findConvexConfectDirectory;

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
          dirs,
          mod,
          fns,
        });
      }),
  );
});

const generateSchema = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const confectDirectory = yield* findConvexConfectDirectory;

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

  const convexDirectory = yield* findConvexDirectory;
  const convexSchemaPath = path.join(convexDirectory, "schema.ts");

  const relativeImportPath = path.relative(
    path.dirname(convexSchemaPath),
    confectSchemaPath,
  );
  const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
  const schemaContentsString = yield* schema({
    schemaImportPath: importPathWithoutExt,
  });

  const schemaContents = new TextEncoder().encode(schemaContentsString);

  yield* fs.writeFile(convexSchemaPath, schemaContents);
});

const generateFunctionModule = ({
  dirs,
  mod,
  fns,
}: {
  dirs: string[];
  mod: string;
  fns: string[];
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // TODO: Use the functions dir specified in `convex.json`
    const convexDirectory = yield* findConvexDirectory;

    const directoryPath = path.join(convexDirectory, "confect", ...dirs);
    if (!(yield* fs.exists(directoryPath))) {
      yield* fs.makeDirectory(directoryPath, { recursive: true });
    }

    const modulePath = path.join(directoryPath, `${mod}.ts`);

    const confectDirectory = yield* findConvexConfectDirectory;

    const serverPath = path.join(confectDirectory, "server.ts");
    const serverImportPath = yield* removePathExtension(
      path.relative(path.dirname(modulePath), serverPath),
    );

    const functionsContentsString = yield* functions({
      dirs,
      mod,
      fns,
      serverImportPath,
    });

    const moduleContents = new TextEncoder().encode(functionsContentsString);
    yield* fs.writeFile(modulePath, moduleContents);
  });

const generateServices = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // TODO: Is this the right approach?
  const test = yield* Config.boolean("CONFECT_TEST").pipe(
    Config.withDefault(false),
  );

  const convexDirectory = yield* findConvexDirectory;
  const confectDirectory = yield* findConvexConfectDirectory;

  const servicesPath = path.join(convexDirectory, "confect", "services.ts");
  const schemaImportPath = path.relative(
    path.dirname(servicesPath),
    path.join(confectDirectory, "schema"),
  );

  const servicesContentsString = yield* services({
    schemaImportPath,
    test,
  });

  const servicesContents = new TextEncoder().encode(servicesContentsString);
  yield* fs.writeFile(servicesPath, servicesContents);
});

const generateHttp = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const convexDirectory = yield* findConvexDirectory;
  const confectDirectory = yield* findConvexConfectDirectory;

  const confectHttpPath = path.join(confectDirectory, "http.ts");

  if (yield* fs.exists(confectHttpPath)) {
    const convexHttpPath = path.join(convexDirectory, "http.ts");

    const relativeImportPath = path.relative(
      path.dirname(convexHttpPath),
      confectHttpPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const httpContentsString = yield* http({
      httpImportPath: importPathWithoutExt,
    });

    const httpContents = new TextEncoder().encode(httpContentsString);
    yield* fs.writeFile(convexHttpPath, httpContents);
  } else {
    yield* Console.debug("No http.ts file found, skipping…");
  }
});

const generateRefs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const convexDirectory = yield* findConvexDirectory;
  const confectDirectory = yield* findConvexConfectDirectory;

  const confectSpecPath = path.join(confectDirectory, "spec.ts");
  const convexRefsPath = path.join(convexDirectory, "confect", "refs.ts");

  const relativeImportPath = path.relative(
    path.dirname(convexRefsPath),
    confectSpecPath,
  );
  const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
  const refsContents = yield* refs({
    specImportPath: importPathWithoutExt,
  });

  yield* fs.writeFileString(convexRefsPath, refsContents);
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

const findConfectDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  const projectRoot = yield* findProjectRoot;

  return path.join(projectRoot, "confect");
});

// Schema for `convex.json` configuration file
// See: https://docs.convex.dev/production/project-configuration
const ConvexJsonConfig = Schema.parseJson(
  Schema.Struct({
    functions: Schema.optional(Schema.String),
  }),
);

const findConvexDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projectRoot = yield* findProjectRoot;

  const defaultPath = path.join(projectRoot, "convex");

  const convexJsonPath = path.join(projectRoot, "convex.json");

  if (yield* fs.exists(convexJsonPath)) {
    const customPath = yield* fs.readFileString(convexJsonPath).pipe(
      Effect.andThen(Schema.decodeOption(ConvexJsonConfig)),
      Effect.map((config) =>
        Option.fromNullable(config.functions).pipe(
          Option.map((functionsDir) => path.join(projectRoot, functionsDir)),
        ),
      ),
    );
    return Option.getOrElse(customPath, () => defaultPath);
  } else {
    return defaultPath;
  }
});

/**
 * The `confect` directory should be a sibling of the `convex` directory.
 */
const findConvexConfectDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;

  const convexDirectory = yield* findConvexDirectory;

  return path.join(path.dirname(convexDirectory), "confect");
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
