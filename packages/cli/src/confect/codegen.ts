import { DatabaseSchema, RegisteredFunctions } from "@confect/server";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Option, Record, Schema, String } from "effect";
import * as tsx from "tsx/esm/api";
import * as templates from "../templates";

export const codegen = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    const projectRoot = yield* findProjectRoot;
    const convexDirectory = yield* findAndCreateConvexDirectory({
      projectRoot,
    });
    const confectDirectory = yield* findConfectDirectory({ convexDirectory });

    yield* generateConfectGeneratedDirectory({ confectDirectory });
    yield* Effect.all(
      [
        generateApi({ confectDirectory }),
        generateRefs({ confectDirectory }),
        generateRegisteredFunctions({ confectDirectory }),
        generateServices({ confectDirectory }),
      ],
      { concurrency: "unbounded" },
    );
    yield* Effect.all(
      [
        generateSchema({ confectDirectory, convexDirectory }),
        generateFunctions({ confectDirectory, convexDirectory }),
        generateHttp({ confectDirectory, convexDirectory }),
        generateConvexConfig({ confectDirectory, convexDirectory }),
        generateCrons({ confectDirectory, convexDirectory }),
        generateAuthConfig({ confectDirectory, convexDirectory }),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(
  Command.withDescription(
    "Generate `confect/_generated` files and the contents of the `convex` directory",
  ),
);

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

    const schemaImportPath = yield* removePathExtension(
      path.relative(
        path.dirname(apiPath),
        path.join(confectDirectory, "schema.ts"),
      ),
    );

    const specImportPath = yield* removePathExtension(
      path.relative(
        path.dirname(apiPath),
        path.join(confectDirectory, "spec.ts"),
      ),
    );

    const apiContents = yield* templates.api({
      schemaImportPath,
      specImportPath,
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

    const registeredFunctionsPath = path.join(
      confectDirectory,
      "_generated",
      "registeredFunctions.ts",
    );
    const registeredFunctionsUrl = yield* path.toFileUrl(
      registeredFunctionsPath,
    );

    const registeredFunctions = yield* Effect.promise(() =>
      tsx.tsImport(registeredFunctionsUrl.href, import.meta.url),
    ).pipe(
      Effect.map(
        (registeredFunctionsModule) =>
          registeredFunctionsModule.default as RegisteredFunctions.AnyWithProps,
      ),
    );

    yield* RegisteredFunctions.reflect(registeredFunctions, {
      onModule: ({ path: modulePath, functions }) =>
        Effect.gen(function* () {
          const mod = Array.last(modulePath).pipe(
            Option.getOrThrowWith(
              () => new Error("Missing module name in function path"),
            ),
          );
          const dirs = Array.init(modulePath).pipe(
            Option.getOrThrowWith(
              () => new Error("Missing directory names in function path"),
            ),
          );
          const fns = Record.keys(functions);

          yield* generateFunctionModule({
            confectDirectory,
            convexDirectory,
            dirs,
            mod,
            fns,
          });
        }),
    });
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

        return DatabaseSchema.isSchema(defaultExport)
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

const generateServices = ({ confectDirectory }: { confectDirectory: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectGeneratedDirectory = path.join(confectDirectory, "_generated");

    const servicesPath = path.join(confectGeneratedDirectory, "services.ts");
    const schemaImportPath = path.relative(
      path.dirname(servicesPath),
      path.join(confectDirectory, "schema"),
    );

    const servicesContentsString = yield* templates.services({
      schemaImportPath,
    });

    const servicesContents = new TextEncoder().encode(servicesContentsString);
    yield* fs.writeFile(servicesPath, servicesContents);
  });

const generateRegisteredFunctions = ({
  confectDirectory,
}: {
  confectDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectGeneratedDirectory = path.join(confectDirectory, "_generated");

    const registeredFunctionsPath = path.join(
      confectGeneratedDirectory,
      "registeredFunctions.ts",
    );
    const implImportPath = yield* removePathExtension(
      path.relative(
        path.dirname(registeredFunctionsPath),
        path.join(confectDirectory, "impl.ts"),
      ),
    );

    const registeredFunctionsContents = yield* templates.registeredFunctions({
      implImportPath,
    });

    yield* fs.writeFileString(
      registeredFunctionsPath,
      registeredFunctionsContents,
    );
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
    }
  });

const generateConvexConfig = ({
  confectDirectory,
  convexDirectory,
}: {
  confectDirectory: string;
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectAppPath = path.join(confectDirectory, "app.ts");

    if (yield* fs.exists(confectAppPath)) {
      const convexConfigPath = path.join(convexDirectory, "convex.config.ts");

      const relativeImportPath = path.relative(
        path.dirname(convexConfigPath),
        confectAppPath,
      );
      const importPathWithoutExt =
        yield* removePathExtension(relativeImportPath);
      const convexConfigContents = yield* templates.convexConfig({
        appImportPath: importPathWithoutExt,
      });

      yield* fs.writeFileString(convexConfigPath, convexConfigContents);
    }
  });

const generateCrons = ({
  confectDirectory,
  convexDirectory,
}: {
  confectDirectory: string;
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectCronsPath = path.join(confectDirectory, "crons.ts");

    if (yield* fs.exists(confectCronsPath)) {
      const convexCronsPath = path.join(convexDirectory, "crons.ts");

      const relativeImportPath = path.relative(
        path.dirname(convexCronsPath),
        confectCronsPath,
      );
      const importPathWithoutExt =
        yield* removePathExtension(relativeImportPath);
      const cronsContents = yield* templates.crons({
        cronsImportPath: importPathWithoutExt,
      });

      yield* fs.writeFileString(convexCronsPath, cronsContents);
    }
  });

const generateAuthConfig = ({
  confectDirectory,
  convexDirectory,
}: {
  confectDirectory: string;
  convexDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const confectAuthPath = path.join(confectDirectory, "auth.ts");

    if (yield* fs.exists(confectAuthPath)) {
      const convexAuthConfigPath = path.join(
        convexDirectory,
        "auth.config.ts",
      );

      const relativeImportPath = path.relative(
        path.dirname(convexAuthConfigPath),
        confectAuthPath,
      );
      const importPathWithoutExt =
        yield* removePathExtension(relativeImportPath);
      const authConfigContents = yield* templates.authConfig({
        authImportPath: importPathWithoutExt,
      });

      yield* fs.writeFileString(convexAuthConfigPath, authConfigContents);
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
