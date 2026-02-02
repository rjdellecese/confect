import { DatabaseSchema, RegisteredFunctions } from "@confect/server";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Option, Record } from "effect";
import * as tsx from "tsx/esm/api";
import { ConfectDirectory } from "../services/ConfectDirectory";
import { ConvexDirectory } from "../services/ConvexDirectory";
import * as templates from "../templates";
import { generateFunctionModule, removePathExtension } from "../utils";

export const codegen = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    yield* generateConfectGeneratedDirectory;
    yield* Effect.all(
      [
        generateApi,
        generateRefs,
        generateRegisteredFunctions,
        generateServices,
      ],
      { concurrency: "unbounded" },
    );
    yield* Effect.all(
      [
        generateSchema,
        generateFunctions,
        generateHttp,
        generateConvexConfig,
        generateCrons,
        generateAuthConfig,
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(
  Command.withDescription(
    "Generate `confect/_generated` files and the contents of the `convex` directory",
  ),
);

const generateConfectGeneratedDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  if (!(yield* fs.exists(path.join(confectDirectory, "_generated")))) {
    yield* fs.makeDirectory(path.join(confectDirectory, "_generated"), {
      recursive: true,
    });
  }
});

const generateApi = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

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

const generateFunctions = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const registeredFunctionsPath = path.join(
    confectDirectory,
    "_generated",
    "registeredFunctions.ts",
  );
  const registeredFunctionsUrl = yield* path.toFileUrl(registeredFunctionsPath);

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

const generateSchema = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

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

const generateServices = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

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

const generateRegisteredFunctions = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

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

const generateHttp = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const confectHttpPath = path.join(confectDirectory, "http.ts");

  if (yield* fs.exists(confectHttpPath)) {
    const convexHttpPath = path.join(convexDirectory, "http.ts");

    const relativeImportPath = path.relative(
      path.dirname(convexHttpPath),
      confectHttpPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const httpContents = yield* templates.http({
      httpImportPath: importPathWithoutExt,
    });

    yield* fs.writeFileString(convexHttpPath, httpContents);
  }
});

const generateConvexConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const confectAppPath = path.join(confectDirectory, "app.ts");

  if (yield* fs.exists(confectAppPath)) {
    const convexConfigPath = path.join(convexDirectory, "convex.config.ts");

    const relativeImportPath = path.relative(
      path.dirname(convexConfigPath),
      confectAppPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const convexConfigContents = yield* templates.convexConfig({
      appImportPath: importPathWithoutExt,
    });

    yield* fs.writeFileString(convexConfigPath, convexConfigContents);
  }
});

const generateCrons = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const confectCronsPath = path.join(confectDirectory, "crons.ts");

  if (yield* fs.exists(confectCronsPath)) {
    const convexCronsPath = path.join(convexDirectory, "crons.ts");

    const relativeImportPath = path.relative(
      path.dirname(convexCronsPath),
      confectCronsPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const cronsContents = yield* templates.crons({
      cronsImportPath: importPathWithoutExt,
    });

    yield* fs.writeFileString(convexCronsPath, cronsContents);
  }
});

const generateAuthConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const confectAuthPath = path.join(confectDirectory, "auth.ts");

  if (yield* fs.exists(confectAuthPath)) {
    const convexAuthConfigPath = path.join(convexDirectory, "auth.config.ts");

    const relativeImportPath = path.relative(
      path.dirname(convexAuthConfigPath),
      confectAuthPath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
    const authConfigContents = yield* templates.authConfig({
      authImportPath: importPathWithoutExt,
    });

    yield* fs.writeFileString(convexAuthConfigPath, authConfigContents);
  }
});

const generateRefs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

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
