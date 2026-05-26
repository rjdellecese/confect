import { type GroupSpec, Spec } from "@confect/core";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Either, HashSet, Match, Option, Ref } from "effect";
import { fromBundlerError } from "../BuildError";
import * as CodegenError from "../CodegenError";
import {
  MissingImplFileError,
  MissingSchemaFileError,
  MissingSpecFileError,
  ParentChildNameCollisionError,
  SchemaInvalidDefaultExportError,
} from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import {
  logFileAdded,
  logFileModified,
  logFileRemoved,
  logPending,
  logSuccess,
} from "../log";
import {
  discoverLeafImplFiles,
  discoverLeafSpecFiles,
  implPathForSpec,
  registeredFunctionsRelativePath,
  specPathForImpl,
  toLeafModule,
  toNodeRegistryLeaf,
  validateImpl,
  validateSpec,
  type LeafModule,
} from "../LeafModule";
import {
  assemblyNodesFromLeaves,
  partitionByRuntime,
  type SpecAssemblyNode,
} from "../SpecAssemblyNode";
import * as templates from "../templates";
import * as Bundler from "../Bundler";
import {
  generateAuthConfig,
  generateCrons,
  generateFunctions,
  generateHttp,
  removePathExtension,
  removePathIfExists,
  toModuleImportPath,
  touchConvexSchema,
  writeFileStringAndLog,
  WriteTracker,
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
    yield* codegenHandler.pipe(
      Effect.asVoid,
      Effect.tap(() => logSuccess("Generated files are up-to-date")),
      CodegenError.tapAndLog,
    );
  }),
).pipe(
  Command.withDescription(
    "Generate `confect/_generated` files and the contents of the `convex` directory (except `convex.config.ts` and `tsconfig.json`)",
  ),
);

export const codegenHandler = Effect.gen(function* () {
  const tracker = yield* Ref.make(false);

  const functionPaths = yield* runCodegen.pipe(
    Effect.provideService(WriteTracker, tracker),
  );

  const anyWritesHappened = yield* Ref.get(tracker);
  return { functionPaths, anyWritesHappened };
});

const runCodegen = Effect.gen(function* () {
  yield* generateConfectGeneratedDirectory;
  // Validate schema first so its missing-file / invalid-default-export
  // diagnostics surface ahead of impl bundling, which transitively depends
  // on schema via `_generated/api.ts` and would otherwise blow up with a
  // less actionable bundler error.
  yield* validateSchema;
  const { leaves, groupSpecsByRelativePath } =
    yield* loadAndValidateLeafModules;
  yield* removeLegacyFiles;
  yield* validateNoParentChildNameCollisions(leaves, groupSpecsByRelativePath);
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
  yield* touchConvexSchema;
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

  const results = yield* Effect.forEach(specFiles, (specRelativePath) =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule(specRelativePath);
      const groupSpec = yield* validateSpec(leaf);

      const implRelativePath = yield* implPathForSpec(specRelativePath);
      const implAbsolutePath = path.join(confectDirectory, implRelativePath);
      if (!(yield* fs.exists(implAbsolutePath))) {
        return yield* new MissingImplFileError({
          specPath: specRelativePath,
          expectedImplPath: implRelativePath,
        });
      }

      return { leaf, groupSpec };
    }),
  );

  yield* validateOrphanImpls(specFiles);

  const leaves = Array.map(results, ({ leaf }) => leaf);
  const groupSpecsByRelativePath = new Map(
    Array.map(results, ({ leaf, groupSpec }) => [leaf.relativePath, groupSpec]),
  );

  return { leaves, groupSpecsByRelativePath };
});

/**
 * Walk the assembly tree and fail with a {@link ParentChildNameCollisionError}
 * when a parent leaf declares a function or subgroup whose name matches a
 * sibling subdirectory spec's segment. Without this check the colliding
 * descendant would overwrite the parent's entry in the assembled
 * `GroupSpec.groups` map at runtime, surfacing as a confusing
 * `Refs.make` error rather than a codegen-time diagnostic.
 */
export const validateNoParentChildNameCollisions = (
  leaves: ReadonlyArray<LeafModule>,
  groupSpecsByRelativePath: ReadonlyMap<string, GroupSpec.AnyWithProps>,
) =>
  Effect.gen(function* () {
    const { convex, node } = partitionByRuntime(leaves);
    const convexNodes = assemblyNodesFromLeaves(convex);
    const nodeNodes = assemblyNodesFromLeaves(
      Array.map(node, toNodeRegistryLeaf),
    );
    yield* Effect.forEach(convexNodes, (n) =>
      checkAssemblyNodeForCollisions(n, groupSpecsByRelativePath),
    );
    yield* Effect.forEach(nodeNodes, (n) =>
      checkAssemblyNodeForCollisions(n, groupSpecsByRelativePath),
    );
  });

const checkAssemblyNodeForCollisions = (
  node: SpecAssemblyNode,
  groupSpecsByRelativePath: ReadonlyMap<string, GroupSpec.AnyWithProps>,
): Effect.Effect<void, ParentChildNameCollisionError> =>
  Effect.gen(function* () {
    yield* Option.match(node.importBinding, {
      onNone: () => Effect.void,
      onSome: (binding) =>
        Effect.gen(function* () {
          if (node.children.length === 0) return;
          const parentRelativePath = bindingToRelativeSpecPath(
            binding.importPath,
          );
          const parentGroupSpec =
            groupSpecsByRelativePath.get(parentRelativePath);
          if (parentGroupSpec === undefined) return;
          yield* Effect.forEach(node.children, (child) => {
            if (
              Object.prototype.hasOwnProperty.call(
                parentGroupSpec.functions,
                child.segment,
              )
            ) {
              return Effect.fail(
                new ParentChildNameCollisionError({
                  parentSpecPath: parentRelativePath,
                  childSpecPath: childRepresentativeSpecPath(child),
                  collisionName: child.segment,
                  collisionKind: "function",
                }),
              );
            }
            if (
              Object.prototype.hasOwnProperty.call(
                parentGroupSpec.groups,
                child.segment,
              )
            ) {
              return Effect.fail(
                new ParentChildNameCollisionError({
                  parentSpecPath: parentRelativePath,
                  childSpecPath: childRepresentativeSpecPath(child),
                  collisionName: child.segment,
                  collisionKind: "group",
                }),
              );
            }
            return Effect.void;
          });
        }),
    });
    yield* Effect.forEach(node.children, (child) =>
      checkAssemblyNodeForCollisions(child, groupSpecsByRelativePath),
    );
  });

/**
 * `LeafModule.specImportPath` is the import path used from inside the
 * generated `_generated/spec.ts` (e.g. `"../notes.spec"`). Strip the
 * `../` prefix and re-add the `.ts` extension to recover the leaf's
 * confect-relative spec path used as the key in
 * `groupSpecsByRelativePath`.
 */
const bindingToRelativeSpecPath = (importPath: string): string => {
  const withoutDotDot = importPath.startsWith("../")
    ? importPath.slice(3)
    : importPath;
  return `${withoutDotDot}.ts`;
};

/**
 * A child assembly node may itself be a parent without a leaf (when the
 * actual leaves live only in deeper subdirectories). In that case we
 * surface the first descendant leaf as a representative path so the
 * error message points at something the user actually wrote.
 */
const childRepresentativeSpecPath = (node: SpecAssemblyNode): string => {
  if (Option.isSome(node.importBinding)) {
    return bindingToRelativeSpecPath(node.importBinding.value.importPath);
  }
  for (const child of node.children) {
    return childRepresentativeSpecPath(child);
  }
  return node.segment;
};

const validateOrphanImpls = (specFiles: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const implFiles = yield* discoverLeafImplFiles;
    const specPaths = new Set(specFiles);

    yield* Effect.forEach(implFiles, (implRelativePath) =>
      Effect.gen(function* () {
        const specRelativePath = yield* specPathForImpl(implRelativePath);
        if (specPaths.has(specRelativePath)) {
          return;
        }

        const specAbsolutePath = path.join(confectDirectory, specRelativePath);
        if (!(yield* fs.exists(specAbsolutePath))) {
          return yield* new MissingSpecFileError({
            implPath: implRelativePath,
            expectedSpecPath: specRelativePath,
          });
        }
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
        yield* removePathIfExists(absolutePath);
        yield* logFileRemoved(absolutePath);
      }
    }),
  );
});

const generateAssembledSpecs = (leaves: ReadonlyArray<LeafModule>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const { convex, node } = partitionByRuntime(leaves);

    if (convex.length > 0) {
      const nodes = assemblyNodesFromLeaves(convex);
      const specContents = yield* templates.assembledSpec({
        nodes,
        runtime: "Convex",
      });
      yield* writeFileStringAndLog(
        path.join(confectDirectory, GENERATED_SPEC_PATH),
        specContents,
      );
    }

    if (node.length > 0) {
      const nodes = assemblyNodesFromLeaves(
        Array.map(node, toNodeRegistryLeaf),
      );
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
  Effect.forEach(leaves, validateImpl);

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
          if (yield* fs.exists(absolutePath)) {
            yield* removePathIfExists(absolutePath);
            yield* logFileRemoved(absolutePath);
          }
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
  const { module: specModule } = yield* Bundler.bundle(specPath);
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

  const { module: nodeSpecModule } = yield* Bundler.bundle(nodeSpecPath);
  const nodeSpec = nodeSpecModule.default;

  if (!Spec.isNodeSpec(nodeSpec)) {
    return yield* Effect.dieMessage(
      "_generated/nodeSpec.ts does not export a valid Node Spec",
    );
  }

  return Option.some(nodeSpec);
});

const emptyFunctionPaths = FunctionPaths.FunctionPaths.make(HashSet.empty());

export const loadPreviousFunctionPaths = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const specPath = yield* getGeneratedSpecPath;

  if (!(yield* fs.exists(specPath))) {
    return emptyFunctionPaths;
  }

  const specEither = yield* loadGeneratedSpec.pipe(Effect.either);

  return yield* Either.match(specEither, {
    onLeft: () => Effect.succeed(emptyFunctionPaths),
    onRight: (spec) =>
      Effect.gen(function* () {
        const nodeSpecOption = yield* loadGeneratedNodeSpec;
        const mergedSpec = Option.match(nodeSpecOption, {
          onNone: () => spec,
          onSome: (nodeSpec) => Spec.merge(spec, nodeSpec),
        });
        return FunctionPaths.make(mergedSpec);
      }),
  });
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
      yield* removePathIfExists(nodeApiPath);
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

export const validateSchema = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const confectSchemaPath = path.join(confectDirectory, "schema.ts");

  if (!(yield* fs.exists(confectSchemaPath))) {
    return yield* new MissingSchemaFileError({ schemaPath: "schema.ts" });
  }

  yield* Bundler.bundle(confectSchemaPath).pipe(
    Effect.mapError((error) => fromBundlerError("schema.ts", error)),
    Effect.andThen(({ module: schemaModule }) => {
      const defaultExport = schemaModule.default;

      return DatabaseSchema.isDatabaseSchema(defaultExport)
        ? Effect.succeed(defaultExport)
        : Effect.fail(
            new SchemaInvalidDefaultExportError({
              schemaPath: "schema.ts",
            }),
          );
    }),
  );
});

const generateSchema = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;

  const confectSchemaPath = path.join(confectDirectory, "schema.ts");

  // `validateSchema` runs once at the top of `runCodegen`; no need to
  // bundle the schema again here.

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
    ? Option.some(
        yield* toModuleImportPath(path.relative(refsDir, nodeSpecPath)),
      )
    : Option.none<string>();

  const refsContents = yield* templates.refs({
    specImportPath,
    nodeSpecImportPath,
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
