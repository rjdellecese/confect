import { Spec } from "@confect/core";
import { DatabaseSchema } from "@confect/server";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Option } from "effect";
import * as tsx from "tsx/esm/api";
import { logCompleted, logFileAdded, logFileModified } from "../log";
import { ConfectDirectory } from "../services/ConfectDirectory";
import { ConvexDirectory } from "../services/ConvexDirectory";
import * as templates from "../templates";
import {
  generateAuthConfig,
  generateConvexConfig,
  generateCrons,
  generateFunctions,
  generateHttp,
  removePathExtension,
  writeFileStringAndLog,
} from "../utils";

export const codegen = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    yield* codegenHandler;
    yield* logCompleted("Generated files are up-to-date");
  }),
).pipe(
  Command.withDescription(
    "Generate `confect/_generated` files and the contents of the `convex` directory (except `tsconfig.json`)",
  ),
);

export const codegenHandler = Effect.gen(function* () {
  yield* generateConfectGeneratedDirectory;
  yield* Effect.all(
    [generateApi, generateRefs, generateRegisteredFunctions, generateServices],
    { concurrency: "unbounded" },
  );
  const [functionPaths] = yield* Effect.all(
    [
      generateFunctionModules,
      generateSchema,
      logGenerated(generateHttp),
      logGenerated(generateConvexConfig),
      logGenerated(generateCrons),
      logGenerated(generateAuthConfig),
    ],
    { concurrency: "unbounded" },
  );
  return functionPaths;
});

const generateConfectGeneratedDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  if (!(yield* fs.exists(path.join(confectDirectory, "_generated")))) {
    yield* fs.makeDirectory(path.join(confectDirectory, "_generated"), {
      recursive: true,
    });
    yield* logFileAdded(path.join(confectDirectory, "_generated") + "/");
  }
});

const generateApi = Effect.gen(function* () {
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

  yield* writeFileStringAndLog(apiPath, apiContents);
});

const generateFunctionModules = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const specPath = path.join(confectDirectory, "spec.ts");
  const specPathUrl = yield* path.toFileUrl(specPath);

  const specModule = yield* Effect.promise(() =>
    tsx.tsImport(specPathUrl.href, import.meta.url),
  );
  const spec = specModule.default;

  if (!Spec.isSpec(spec)) {
    return yield* Effect.die("spec.ts does not export a valid Spec");
  }

  return yield* generateFunctions(spec);
});

const generateSchema = Effect.gen(function* () {
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

  yield* writeFileStringAndLog(convexSchemaPath, schemaContents);
});

const generateServices = Effect.gen(function* () {
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

  yield* writeFileStringAndLog(servicesPath, servicesContentsString);
});

const generateRegisteredFunctions = Effect.gen(function* () {
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

  yield* writeFileStringAndLog(
    registeredFunctionsPath,
    registeredFunctionsContents,
  );
});

const generateRefs = Effect.gen(function* () {
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

  yield* writeFileStringAndLog(refsPath, refsContents);
});

const logGenerated = (effect: typeof generateHttp) =>
  effect.pipe(
    Effect.tap(
      Option.match({
        onNone: () => Effect.void,
        onSome: ({ change, convexFilePath }) =>
          Match.value(change).pipe(
            Match.when("Added", () => logFileAdded(convexFilePath)),
            Match.when("Modified", () => logFileModified(convexFilePath)),
            Match.when("Unchanged", () => Effect.void),
            Match.exhaustive,
          ),
      }),
    ),
  );
