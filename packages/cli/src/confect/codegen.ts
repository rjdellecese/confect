import { Spec } from "@confect/core";
import { DatabaseSchema } from "@confect/server";
import { Effect, Match, Option } from "effect";
import { Command } from "effect/unstable/cli";
import { findConfectDirectory } from "../ConfectDirectory";
import { findConvexDirectory } from "../ConvexDirectory";
import * as Fs from "../internal/fs";
import * as Path from "../internal/path";
import {
  logFileAdded,
  logFileModified,
  logFileRemoved,
  logPending,
  logSuccess,
} from "../log";
import * as templates from "../templates";
import {
  bundleAndImport,
  generateAuthConfig,
  generateCrons,
  generateFunctions,
  generateHttp,
  removePathExtension,
  writeFileStringAndLog,
} from "../utils";

const getNodeSpecPath = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;
  return Path.join(confectDirectory, "nodeSpec.ts");
});

const loadNodeSpec = Effect.gen(function* () {
  const nodeSpecPath = yield* getNodeSpecPath;

  if (!(yield* Fs.exists(nodeSpecPath))) {
    return Option.none<Spec.AnyWithPropsWithRuntime<"Node">>();
  }

  const nodeSpecModule = yield* bundleAndImport(nodeSpecPath);
  const nodeSpec = nodeSpecModule.default;

  if (!Spec.isNodeSpec(nodeSpec)) {
    return yield* Effect.die("nodeSpec.ts does not export a valid Node Spec");
  }

  return Option.some(nodeSpec as Spec.AnyWithPropsWithRuntime<"Node">);
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
      logGenerated(generateCrons),
      logGenerated(generateAuthConfig),
    ],
    { concurrency: "unbounded" },
  );
  return functionPaths;
});

const generateConfectGeneratedDirectory = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;

  if (!(yield* Fs.exists(Path.join(confectDirectory, "_generated")))) {
    yield* Fs.makeDirectory(Path.join(confectDirectory, "_generated"), {
      recursive: true,
    });
    yield* logFileAdded(Path.join(confectDirectory, "_generated") + "/");
  }
});

const generateApi = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;

  const apiPath = Path.join(confectDirectory, "_generated", "api.ts");
  const apiDir = Path.dirname(apiPath);

  const schemaImportPath = removePathExtension(
    Path.relative(apiDir, Path.join(confectDirectory, "schema.ts")),
  );

  const specImportPath = removePathExtension(
    Path.relative(apiDir, Path.join(confectDirectory, "spec.ts")),
  );

  const apiContents = yield* templates.api({
    schemaImportPath,
    specImportPath,
  });

  yield* writeFileStringAndLog(apiPath, apiContents);
});

export const generateNodeApi = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;

  const nodeSpecPath = yield* getNodeSpecPath;
  const nodeApiPath = Path.join(confectDirectory, "_generated", "nodeApi.ts");

  if (!(yield* Fs.exists(nodeSpecPath))) {
    if (yield* Fs.exists(nodeApiPath)) {
      yield* Fs.remove(nodeApiPath);
      yield* logFileRemoved(nodeApiPath);
    }
    return;
  }

  const nodeApiDir = Path.dirname(nodeApiPath);

  const schemaImportPath = removePathExtension(
    Path.relative(nodeApiDir, Path.join(confectDirectory, "schema.ts")),
  );

  const nodeSpecImportPath = removePathExtension(
    Path.relative(nodeApiDir, nodeSpecPath),
  );

  const nodeApiContents = yield* templates.nodeApi({
    schemaImportPath,
    nodeSpecImportPath,
  });

  yield* writeFileStringAndLog(nodeApiPath, nodeApiContents);
});

const generateFunctionModules = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;

  const specPath = Path.join(confectDirectory, "spec.ts");

  const specModule = yield* bundleAndImport(specPath);
  const spec = specModule.default;

  if (!Spec.isConvexSpec(spec)) {
    return yield* Effect.die("spec.ts does not export a valid Convex Spec");
  }

  const nodeImplPath = Path.join(confectDirectory, "nodeImpl.ts");
  const nodeImplExists = yield* Fs.exists(nodeImplPath);
  const nodeSpecOption = yield* loadNodeSpec;

  const mergedSpec = Option.match(nodeSpecOption, {
    onNone: () => spec,
    onSome: (nodeSpec) => (nodeImplExists ? Spec.merge(spec, nodeSpec) : spec),
  });

  return yield* generateFunctions(mergedSpec);
});

const generateSchema = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;
  const convexDirectory = yield* findConvexDirectory;

  const confectSchemaPath = Path.join(confectDirectory, "schema.ts");

  yield* bundleAndImport(confectSchemaPath).pipe(
    Effect.andThen((schemaModule) => {
      const defaultExport = schemaModule.default;

      return DatabaseSchema.isDatabaseSchema(defaultExport)
        ? Effect.succeed(defaultExport)
        : Effect.die("Invalid schema module");
    }),
  );

  const convexSchemaPath = Path.join(convexDirectory, "schema.ts");

  const relativeImportPath = Path.relative(
    Path.dirname(convexSchemaPath),
    confectSchemaPath,
  );
  const importPathWithoutExt = removePathExtension(relativeImportPath);
  const schemaContents = yield* templates.schema({
    schemaImportPath: importPathWithoutExt,
  });

  yield* writeFileStringAndLog(convexSchemaPath, schemaContents);
});

const generateServices = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;

  const confectGeneratedDirectory = Path.join(confectDirectory, "_generated");

  const servicesPath = Path.join(confectGeneratedDirectory, "services.ts");
  const schemaImportPath = Path.relative(
    Path.dirname(servicesPath),
    Path.join(confectDirectory, "schema"),
  );

  const servicesContentsString = yield* templates.services({
    schemaImportPath,
  });

  yield* writeFileStringAndLog(servicesPath, servicesContentsString);
});

const generateRegisteredFunctions = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;

  const confectGeneratedDirectory = Path.join(confectDirectory, "_generated");

  const registeredFunctionsPath = Path.join(
    confectGeneratedDirectory,
    "registeredFunctions.ts",
  );
  const implImportPath = removePathExtension(
    Path.relative(
      Path.dirname(registeredFunctionsPath),
      Path.join(confectDirectory, "impl.ts"),
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
  const confectDirectory = yield* findConfectDirectory;

  const nodeImplPath = Path.join(confectDirectory, "nodeImpl.ts");
  const nodeSpecPath = yield* getNodeSpecPath;
  const nodeRegisteredFunctionsPath = Path.join(
    confectDirectory,
    "_generated",
    "nodeRegisteredFunctions.ts",
  );

  const nodeImplExists = yield* Fs.exists(nodeImplPath);
  const nodeSpecExists = yield* Fs.exists(nodeSpecPath);

  if (!nodeImplExists || !nodeSpecExists) {
    if (yield* Fs.exists(nodeRegisteredFunctionsPath)) {
      yield* Fs.remove(nodeRegisteredFunctionsPath);
      yield* logFileRemoved(nodeRegisteredFunctionsPath);
    }
    return;
  }

  const nodeImplImportPath = removePathExtension(
    Path.relative(Path.dirname(nodeRegisteredFunctionsPath), nodeImplPath),
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
  const confectDirectory = yield* findConfectDirectory;

  const confectGeneratedDirectory = Path.join(confectDirectory, "_generated");
  const refsPath = Path.join(confectGeneratedDirectory, "refs.ts");
  const refsDir = Path.dirname(refsPath);

  const specImportPath = removePathExtension(
    Path.relative(refsDir, Path.join(confectDirectory, "spec.ts")),
  );

  const nodeSpecPath = yield* getNodeSpecPath;
  const nodeSpecExists = yield* Fs.exists(nodeSpecPath);
  const nodeSpecImportPath = nodeSpecExists
    ? removePathExtension(Path.relative(refsDir, nodeSpecPath))
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
