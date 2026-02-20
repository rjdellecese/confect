import { Spec } from "@confect/core";
import { DatabaseSchema } from "@confect/server";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Option } from "effect";
import {
  logFileAdded,
  logFileModified,
  logFileRemoved,
  logPending,
  logSuccess,
} from "../log";
import { ConfectDirectory } from "../services/ConfectDirectory";
import { ConvexDirectory } from "../services/ConvexDirectory";
import * as templates from "../templates";
import {
  bundleAndImport,
  generateAuthConfig,
  generateConvexConfig,
  generateCrons,
  generateFunctions,
  generateHttp,
  removePathExtension,
  writeFileStringAndLog,
} from "../utils";

const getNodeSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  return path.join(confectDirectory, "nodeSpec.ts");
});

const loadNodeSpec = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const nodeSpecPath = yield* getNodeSpecPath;

  if (!(yield* fs.exists(nodeSpecPath))) {
    return Option.none<Spec.AnyWithPropsWithRuntime<"Node">>();
  }

  const nodeSpecModule = yield* bundleAndImport(nodeSpecPath);
  const nodeSpec = nodeSpecModule.default;

  if (!Spec.isNodeSpec(nodeSpec)) {
    return yield* Effect.die("nodeSpec.ts does not export a valid Node Spec");
  }

  return Option.some(nodeSpec);
});

export const codegen = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    yield* logPending("Performing initial sync…");
    yield* codegenHandler;
    yield* logSuccess("Generated files are up-to-date");
  }),
).pipe(
  Command.withDescription(
    "Generate `confect/_generated` files and the contents of the `convex` directory (except `tsconfig.json`)",
  ),
);

export const codegenHandler = Effect.gen(function* () {
  yield* generateConfectGeneratedDirectory;
  yield* Effect.all(
    [
      generateApi,
      generateRefs,
      generateRegisteredFunctions,
      generateNodeApi,
      generateNodeRegisteredFunctions,
      generateServices,
    ],
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
  const apiDir = path.dirname(apiPath);

  const schemaImportPath = yield* removePathExtension(
    path.relative(apiDir, path.join(confectDirectory, "schema.ts")),
  );

  const specImportPath = yield* removePathExtension(
    path.relative(apiDir, path.join(confectDirectory, "spec.ts")),
  );

  const apiContents = yield* templates.api({
    schemaImportPath,
    specImportPath,
  });

  yield* writeFileStringAndLog(apiPath, apiContents);
});

export const generateNodeApi = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const nodeSpecPath = yield* getNodeSpecPath;
  const nodeApiPath = path.join(confectDirectory, "_generated", "nodeApi.ts");

  if (!(yield* fs.exists(nodeSpecPath))) {
    if (yield* fs.exists(nodeApiPath)) {
      yield* fs.remove(nodeApiPath);
      yield* logFileRemoved(nodeApiPath);
    }
    return;
  }

  const nodeApiDir = path.dirname(nodeApiPath);

  const schemaImportPath = yield* removePathExtension(
    path.relative(nodeApiDir, path.join(confectDirectory, "schema.ts")),
  );

  const nodeSpecImportPath = yield* removePathExtension(
    path.relative(nodeApiDir, nodeSpecPath),
  );

  const nodeApiContents = yield* templates.nodeApi({
    schemaImportPath,
    nodeSpecImportPath,
  });

  yield* writeFileStringAndLog(nodeApiPath, nodeApiContents);
});

const generateFunctionModules = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const specPath = path.join(confectDirectory, "spec.ts");

  const specModule = yield* bundleAndImport(specPath);
  const spec = specModule.default;

  if (!Spec.isConvexSpec(spec)) {
    return yield* Effect.die("spec.ts does not export a valid Convex Spec");
  }

  const nodeImplPath = path.join(confectDirectory, "nodeImpl.ts");
  const nodeImplExists = yield* fs.exists(nodeImplPath);
  const nodeSpecOption = yield* loadNodeSpec;

  const mergedSpec = Option.match(nodeSpecOption, {
    onNone: () => spec,
    onSome: (nodeSpec) => (nodeImplExists ? Spec.merge(spec, nodeSpec) : spec),
  });

  return yield* generateFunctions(mergedSpec);
});

const generateSchema = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const confectSchemaPath = path.join(confectDirectory, "schema.ts");

  yield* bundleAndImport(confectSchemaPath).pipe(
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

export const generateNodeRegisteredFunctions = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const nodeImplPath = path.join(confectDirectory, "nodeImpl.ts");
  const nodeSpecPath = yield* getNodeSpecPath;
  const nodeRegisteredFunctionsPath = path.join(
    confectDirectory,
    "_generated",
    "nodeRegisteredFunctions.ts",
  );

  const nodeImplExists = yield* fs.exists(nodeImplPath);
  const nodeSpecExists = yield* fs.exists(nodeSpecPath);

  if (!nodeImplExists || !nodeSpecExists) {
    if (yield* fs.exists(nodeRegisteredFunctionsPath)) {
      yield* fs.remove(nodeRegisteredFunctionsPath);
      yield* logFileRemoved(nodeRegisteredFunctionsPath);
    }
    return;
  }

  const nodeImplImportPath = yield* removePathExtension(
    path.relative(path.dirname(nodeRegisteredFunctionsPath), nodeImplPath),
  );

  const nodeRegisteredFunctionsContents =
    yield* templates.nodeRegisteredFunctions({
      nodeImplImportPath,
    });

  yield* writeFileStringAndLog(
    nodeRegisteredFunctionsPath,
    nodeRegisteredFunctionsContents,
  );
});

const generateRefs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const confectGeneratedDirectory = path.join(confectDirectory, "_generated");
  const refsPath = path.join(confectGeneratedDirectory, "refs.ts");
  const refsDir = path.dirname(refsPath);

  const specImportPath = yield* removePathExtension(
    path.relative(refsDir, path.join(confectDirectory, "spec.ts")),
  );

  const nodeSpecPath = yield* getNodeSpecPath;
  const nodeSpecExists = yield* fs.exists(nodeSpecPath);
  const nodeSpecImportPath = nodeSpecExists
    ? yield* removePathExtension(path.relative(refsDir, nodeSpecPath))
    : null;

  const refsContents = yield* templates.refs({
    specImportPath,
    ...(nodeSpecImportPath === null ? {} : { nodeSpecImportPath }),
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
