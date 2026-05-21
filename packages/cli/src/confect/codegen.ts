import { DatabaseSchema, Spec } from "@confect/core";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Either, Match, Option } from "effect";
import { ConfectDirectory } from "../ConfectDirectory";
import { ConvexDirectory } from "../ConvexDirectory";
import {
  ImplValidationError,
  validateImplModule,
  validateSpecModule,
} from "../implValidation";
import {
  logFailure,
  logFileAdded,
  logFileModified,
  logFileRemoved,
  logPending,
  logSuccess,
} from "../log";
import {
  discoverLeafSpecFiles,
  implPathForSpec,
  registeredFunctionsRelativePath,
  toLeafModule,
  toNodeRegistryLeaf,
  type LeafModule,
} from "../modulePaths";
import {
  buildSpecTree,
  collectConvexLeaves,
  collectNodeLeaves,
  collectSpecAssemblyNodes,
} from "../specAssembly";
import * as templates from "../templates";
import {
  bundleAndImport,
  generateAuthConfig,
  generateCrons,
  generateFunctions,
  generateHttp,
  removePathExtension,
  toModuleImportPath,
  writeFileStringAndLog,
} from "../utils";

const GENERATED_SPEC_PATH = "_generated/spec.ts";
const GENERATED_NODE_SPEC_PATH = "_generated/nodeSpec.ts";

const LEGACY_PATHS = [
  "spec.ts",
  "nodeSpec.ts",
  "impl.ts",
  "nodeImpl.ts",
  "notesAndRandom.impl.ts",
  "groups.impl.ts",
  "_generated/registeredFunctions.ts",
  "_generated/nodeRegisteredFunctions.ts",
  "_generated/impl.ts",
  "_generated/nodeImpl.ts",
];

export const codegen = Command.make("codegen", {}, () =>
  Effect.gen(function* () {
    yield* logPending("Performing initial sync…");
    const result = yield* Effect.either(codegenHandler);
    yield* Either.match(result, {
      onLeft: (error) =>
        logFailure(error.message).pipe(Effect.andThen(Effect.fail(error))),
      onRight: () => logSuccess("Generated files are up-to-date"),
    });
  }),
).pipe(
  Command.withDescription(
    "Generate `confect/_generated` files and the contents of the `convex` directory (except `tsconfig.json`)",
  ),
);

export const codegenHandler = Effect.gen(function* () {
  yield* generateConfectGeneratedDirectory;
  const leaves = yield* loadAndValidateLeafModules;
  yield* removeLegacyFiles;
  yield* generateAssembledSpecs(leaves);
  yield* validateImplModules(leaves);
  yield* generateGroupRegisteredFunctions(leaves);
  yield* removeObsoleteRegisteredFunctions(leaves);
  yield* Effect.all(
    [generateApi, generateRefs, generateNodeApi, generateServices],
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

const loadAndValidateLeafModules = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const specFiles = yield* discoverLeafSpecFiles;

  return yield* Effect.forEach(specFiles, (specRelativePath) =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule(specRelativePath);
      yield* validateSpecModule(specRelativePath);

      const implRelativePath = yield* implPathForSpec(specRelativePath);
      const implAbsolutePath = path.join(confectDirectory, implRelativePath);
      if (!(yield* fs.exists(implAbsolutePath))) {
        return yield* new ImplValidationError({
          file: implRelativePath,
          reason: `required sibling impl for ${specRelativePath}`,
        });
      }

      return leaf;
    }),
  );
});

const removeLegacyFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  yield* Effect.forEach(LEGACY_PATHS, (relativePath) =>
    Effect.gen(function* () {
      const absolutePath = path.join(confectDirectory, relativePath);
      if (yield* fs.exists(absolutePath)) {
        yield* fs.remove(absolutePath);
        yield* logFileRemoved(absolutePath);
      }
    }),
  );
});

const generateAssembledSpecs = (leaves: ReadonlyArray<LeafModule>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const convexLeaves = collectConvexLeaves(leaves);
    const nodeLeaves = collectNodeLeaves(leaves);

    if (convexLeaves.length > 0) {
      const tree = buildSpecTree(convexLeaves);
      const nodes = collectSpecAssemblyNodes(tree);
      const specContents = yield* templates.assembledSpec({
        nodes,
        runtime: "Convex",
      });
      yield* writeFileStringAndLog(
        path.join(confectDirectory, GENERATED_SPEC_PATH),
        specContents,
      );
    }

    if (nodeLeaves.length > 0) {
      const tree = buildSpecTree(Array.map(nodeLeaves, toNodeRegistryLeaf));
      const nodes = collectSpecAssemblyNodes(tree);
      const nodeSpecContents = yield* templates.assembledSpec({
        nodes,
        runtime: "Node",
      });
      yield* writeFileStringAndLog(
        path.join(confectDirectory, GENERATED_NODE_SPEC_PATH),
        nodeSpecContents,
      );
    }
  });

const validateImplModules = (leaves: ReadonlyArray<LeafModule>) =>
  Effect.forEach(leaves, (leaf) =>
    Effect.gen(function* () {
      const implRelativePath = yield* implPathForSpec(leaf.relativePath);
      yield* validateImplModule(implRelativePath, leaf.relativePath);
    }),
  );

const generateGroupRegisteredFunctions = (leaves: ReadonlyArray<LeafModule>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* Effect.forEach(leaves, (leaf) =>
      Effect.gen(function* () {
        const registryRelativePath =
          yield* registeredFunctionsRelativePath(leaf);
        const registryPath = path.join(
          confectDirectory,
          "_generated",
          registryRelativePath,
        );
        const registryDir = path.dirname(registryPath);
        const fs = yield* FileSystem.FileSystem;
        if (!(yield* fs.exists(registryDir))) {
          yield* fs.makeDirectory(registryDir, { recursive: true });
        }

        const implRelativePath = yield* implPathForSpec(leaf.relativePath);
        const apiFileName = leaf.runtime === "Node" ? "nodeApi.ts" : "api.ts";
        const apiImportPath = yield* toModuleImportPath(
          path.relative(
            path.dirname(registryPath),
            path.join(confectDirectory, "_generated", apiFileName),
          ),
        );
        const implImportPath = yield* toModuleImportPath(
          path.relative(
            path.dirname(registryPath),
            path.join(confectDirectory, implRelativePath),
          ),
        );

        const contents = yield* templates.registeredFunctionsForGroup({
          apiImportPath,
          groupPathDot: leaf.registryGroupPathDot,
          implImportPath,
          layerExportName: leaf.exportName,
          useNode: leaf.runtime === "Node",
        });

        yield* writeFileStringAndLog(registryPath, contents);
      }),
    );
  });

const removeObsoleteRegisteredFunctions = (leaves: ReadonlyArray<LeafModule>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const registryRoot = path.join(
      confectDirectory,
      "_generated",
      "registeredFunctions",
    );

    if (!(yield* fs.exists(registryRoot))) {
      return;
    }

    const expected = new Set(
      yield* Effect.forEach(leaves, (leaf) =>
        registeredFunctionsRelativePath(leaf),
      ),
    );

    const existing = yield* fs.readDirectory(registryRoot, { recursive: true });
    yield* Effect.forEach(existing, (relativePath) => {
      if (path.extname(relativePath) !== ".ts") {
        return Effect.void;
      }
      const normalized = path.join("registeredFunctions", relativePath);
      if (!expected.has(normalized)) {
        return Effect.gen(function* () {
          const absolutePath = path.join(registryRoot, relativePath);
          yield* fs.remove(absolutePath);
          yield* logFileRemoved(absolutePath);
        });
      }
      return Effect.void;
    });
  });

const getGeneratedSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  return path.join(confectDirectory, GENERATED_SPEC_PATH);
});

const getGeneratedNodeSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  return path.join(confectDirectory, GENERATED_NODE_SPEC_PATH);
});

const loadGeneratedSpec = Effect.gen(function* () {
  const specPath = yield* getGeneratedSpecPath;
  const specModule = yield* bundleAndImport(specPath);
  const spec = specModule.default;

  if (!Spec.isConvexSpec(spec)) {
    return yield* Effect.dieMessage(
      "_generated/spec.ts does not export a valid Convex Spec",
    );
  }

  return spec;
});

const loadGeneratedNodeSpec = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const nodeSpecPath = yield* getGeneratedNodeSpecPath;

  if (!(yield* fs.exists(nodeSpecPath))) {
    return Option.none<Spec.AnyWithPropsWithRuntime<"Node">>();
  }

  const nodeSpecModule = yield* bundleAndImport(nodeSpecPath);
  const nodeSpec = nodeSpecModule.default;

  if (!Spec.isNodeSpec(nodeSpec)) {
    return yield* Effect.dieMessage(
      "_generated/nodeSpec.ts does not export a valid Node Spec",
    );
  }

  return Option.some(nodeSpec);
});

const generateApi = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const apiPath = path.join(confectDirectory, "_generated", "api.ts");
  const apiDir = path.dirname(apiPath);

  const schemaImportPath = yield* toModuleImportPath(
    path.relative(apiDir, path.join(confectDirectory, "schema.ts")),
  );

  const specImportPath = yield* toModuleImportPath(
    path.relative(apiDir, path.join(confectDirectory, GENERATED_SPEC_PATH)),
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

  const nodeSpecPath = yield* getGeneratedNodeSpecPath;
  const nodeApiPath = path.join(confectDirectory, "_generated", "nodeApi.ts");

  if (!(yield* fs.exists(nodeSpecPath))) {
    if (yield* fs.exists(nodeApiPath)) {
      yield* fs.remove(nodeApiPath);
      yield* logFileRemoved(nodeApiPath);
    }
    return;
  }

  const nodeApiDir = path.dirname(nodeApiPath);

  const schemaImportPath = yield* toModuleImportPath(
    path.relative(nodeApiDir, path.join(confectDirectory, "schema.ts")),
  );

  const nodeSpecImportPath = yield* toModuleImportPath(
    path.relative(nodeApiDir, nodeSpecPath),
  );

  const nodeApiContents = yield* templates.nodeApi({
    schemaImportPath,
    nodeSpecImportPath,
  });

  yield* writeFileStringAndLog(nodeApiPath, nodeApiContents);
});

const generateFunctionModules = Effect.gen(function* () {
  const spec = yield* loadGeneratedSpec;
  const nodeSpecOption = yield* loadGeneratedNodeSpec;

  const mergedSpec = Option.match(nodeSpecOption, {
    onNone: () => spec,
    onSome: (nodeSpec) => Spec.merge(spec, nodeSpec),
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

      return DatabaseSchema.isDatabaseSchema(defaultExport)
        ? Effect.succeed(defaultExport)
        : Effect.dieMessage("Invalid schema module");
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

const generateRefs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const confectGeneratedDirectory = path.join(confectDirectory, "_generated");
  const refsPath = path.join(confectGeneratedDirectory, "refs.ts");
  const refsDir = path.dirname(refsPath);

  const specImportPath = yield* toModuleImportPath(
    path.relative(refsDir, path.join(confectDirectory, GENERATED_SPEC_PATH)),
  );

  const nodeSpecPath = yield* getGeneratedNodeSpecPath;
  const nodeSpecExists = yield* fs.exists(nodeSpecPath);
  const nodeSpecImportPath = nodeSpecExists
    ? yield* toModuleImportPath(path.relative(refsDir, nodeSpecPath))
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
