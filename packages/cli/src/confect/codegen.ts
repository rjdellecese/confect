import { Spec, type GroupSpec } from "@confect/core";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Either, HashSet, Match, Option, Ref } from "effect";
import * as Bundler from "../Bundler";
import * as CodegenError from "../CodegenError";
import {
  LegacySchemaFileError,
  MissingImplFileError,
  MissingSpecFileError,
  ParentChildNameCollisionError,
} from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
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
  logFileAdded,
  logFileModified,
  logFileRemoved,
  logPending,
  logSuccess,
  logWarn,
} from "../log";
import {
  assemblyNodesFromLeaves,
  partitionByRuntime,
  type SpecAssemblyNode,
} from "../SpecAssemblyNode";
import * as TableModule from "../TableModule";
import * as templates from "../templates";
import {
  generateAuthConfig,
  generateCrons,
  generateFunctions,
  generateHttp,
  removePathIfExists,
  toModuleImportPath,
  touchConvexSchema,
  writeFileStringAndLog,
  WriteTracker,
} from "../utils";

const GENERATED_DIRNAME = "_generated";

const GENERATED_SPEC_PATH = Effect.andThen(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "spec.ts"),
);
const GENERATED_NODE_SPEC_PATH = Effect.andThen(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "nodeSpec.ts"),
);
const GENERATED_SCHEMA_PATH = Effect.andThen(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "schema.ts"),
);
const GENERATED_CONVEX_SCHEMA_PATH = Effect.andThen(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "convexSchema.ts"),
);
const GENERATED_ID_PATH = Effect.andThen(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "id.ts"),
);
const GENERATED_TABLES_DIRNAME = Effect.andThen(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "tables"),
);

const LEGACY_PATHS = Effect.gen(function* () {
  const path = yield* Path.Path;

  return [
    "spec.ts",
    "nodeSpec.ts",
    "impl.ts",
    "nodeImpl.ts",
    path.join(GENERATED_DIRNAME, "registeredFunctions.ts"),
    path.join(GENERATED_DIRNAME, "nodeRegisteredFunctions.ts"),
    path.join(GENERATED_DIRNAME, "impl.ts"),
    path.join(GENERATED_DIRNAME, "nodeImpl.ts"),
  ];
});

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
  // Reject a legacy `confect/schema.ts` up front so the user-facing
  // migration message surfaces before any bundler error from impl
  // validation (which transitively imports `_generated/api.ts`, which
  // imports `_generated/schema.ts`).
  yield* rejectLegacySchemaFile;
  // List `confect/tables/*.ts` (filename-only — no bundling yet) so the
  // `_generated/id.ts` constructor can be emitted *before* we bundle any
  // user-authored table module. Tables import from `_generated/id.ts` for
  // cross-table id refs, so it must exist on disk first.
  const tableModules = yield* TableModule.discover;
  yield* warnIfNoTables(tableModules);
  yield* generateIdConstructor(tableModules);
  // Now that `_generated/id.ts` is on disk, bundle each table module and
  // check its default export is an `UnnamedTable`. Surface diagnostics
  // here (rather than later) so they appear before impl-validation noise.
  yield* TableModule.validate(tableModules);
  yield* generateTableWrappers(tableModules);
  yield* removeObsoleteTableWrappers(tableModules);
  yield* generateRuntimeSchema(tableModules);
  const { leaves, groupSpecsByRelativePath } =
    yield* loadAndValidateLeafModules;
  yield* removeLegacyFiles;
  yield* validateNoParentChildNameCollisions(leaves, groupSpecsByRelativePath);
  yield* generateAssembledSpecs(leaves);
  // `_generated/api.ts` (and `_generated/nodeApi.ts`) must be regenerated
  // before `validateImplModules`, because each impl bundle transitively
  // imports `_generated/api.ts`; the stale on-disk copy would still point
  // at the now-deleted user-authored `confect/schema.ts` and fail to
  // resolve.
  yield* Effect.all(
    [
      generateApi,
      generateRefs,
      generateNodeApi,
      generateServices,
      generateConvexSchema(tableModules),
    ],
    { concurrency: "unbounded" },
  );
  yield* validateImplModules(leaves);
  yield* generateGroupRegisteredFunctions(leaves);
  yield* removeObsoleteRegisteredFunctions(leaves);
  const [functionPaths] = yield* Effect.all(
    [
      generateFunctionModules,
      generateConvexSchemaReexport,
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
  const legacyPaths = yield* LEGACY_PATHS;

  yield* Effect.forEach(legacyPaths, (relativePath) =>
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
    const generatedSpecPath = yield* GENERATED_SPEC_PATH;
    const generatedNodeSpecPath = yield* GENERATED_NODE_SPEC_PATH;
    const { convex, node } = partitionByRuntime(leaves);

    if (convex.length > 0) {
      const nodes = assemblyNodesFromLeaves(convex);
      const specContents = yield* templates.assembledSpec({
        nodes,
        runtime: "Convex",
      });
      yield* writeFileStringAndLog(
        path.join(confectDirectory, generatedSpecPath),
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
        path.join(confectDirectory, generatedNodeSpecPath),
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
  const generatedSpecPath = yield* GENERATED_SPEC_PATH;
  return path.join(confectDirectory, generatedSpecPath);
});

const getGeneratedNodeSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const generatedNodeSpecPath = yield* GENERATED_NODE_SPEC_PATH;
  return path.join(confectDirectory, generatedNodeSpecPath);
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
  const generatedSchemaPath = yield* GENERATED_SCHEMA_PATH;
  const generatedSpecPath = yield* GENERATED_SPEC_PATH;

  const apiPath = path.join(confectDirectory, "_generated", "api.ts");
  const apiDir = path.dirname(apiPath);

  const schemaImportPath = yield* toModuleImportPath(
    path.relative(apiDir, path.join(confectDirectory, generatedSchemaPath)),
  );

  const specImportPath = yield* toModuleImportPath(
    path.relative(apiDir, path.join(confectDirectory, generatedSpecPath)),
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
  const generatedSchemaPath = yield* GENERATED_SCHEMA_PATH;

  const schemaImportPath = yield* toModuleImportPath(
    path.relative(nodeApiDir, path.join(confectDirectory, generatedSchemaPath)),
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

/**
 * The user-authored `confect/schema.ts` is no longer supported: codegen now
 * owns both `_generated/schema.ts` (runtime) and `_generated/convexSchema.ts`
 * (deploy), derived from a single scan of `confect/tables/*.ts`. Detect a
 * stray file and fail with a clear migration message — leaving it in place
 * would silently shadow the codegen output and confuse `_generated/api.ts`.
 */
const rejectLegacySchemaFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const legacyPath = path.join(confectDirectory, "schema.ts");

  if (yield* fs.exists(legacyPath)) {
    return yield* new LegacySchemaFileError({ schemaPath: "schema.ts" });
  }
});

/**
 * Surface a yellow `⚠` warning when codegen sees no tables — either the
 * `confect/tables/` directory is missing or it contains no `.ts` files.
 * Generation still succeeds (emitting an empty `DatabaseSchema` and
 * `defineSchema({})`), since action-only / table-free Confect backends
 * are legal — but the warning catches the much more common case of a
 * typoed directory or files placed under the wrong root.
 */
const warnIfNoTables = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) =>
  tableModules.length === 0
    ? logWarn(
        `No tables discovered in \`confect/${TableModule.TABLES_DIRNAME}/\`. ` +
          `Generating an empty schema; add a \`Table.make(...)\` module under that ` +
          `directory unless this backend is intentionally tables-free.`,
      )
    : Effect.void;

const tableModuleBindings = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
  generatedFilePath: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const generatedDir = path.dirname(generatedFilePath);

    const generatedTablesDirname = yield* GENERATED_TABLES_DIRNAME;

    return yield* Effect.forEach(tableModules, (tm) =>
      Effect.gen(function* () {
        const wrapperAbsolutePath = path.join(
          confectDirectory,
          generatedTablesDirname,
          `${tm.tableName}.ts`,
        );
        const importPath = yield* toModuleImportPath(
          path.relative(generatedDir, wrapperAbsolutePath),
        );
        return {
          importPath,
          tableName: tm.tableName,
        };
      }),
    );
  });

const generateIdConstructor = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const generatedIdPath = yield* GENERATED_ID_PATH;
    const idPath = path.join(confectDirectory, generatedIdPath);

    const tableNames = tableModules.map((tm) => tm.tableName);
    const contents = yield* templates.id({ tableNames });

    yield* writeFileStringAndLog(idPath, contents);
  });

const generateTableWrappers = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const generatedTablesDirname = yield* GENERATED_TABLES_DIRNAME;
    const wrappersDir = path.join(confectDirectory, generatedTablesDirname);

    if (!(yield* fs.exists(wrappersDir))) {
      yield* fs.makeDirectory(wrappersDir, { recursive: true });
    }

    yield* Effect.forEach(
      tableModules,
      (tm) =>
        Effect.gen(function* () {
          const wrapperPath = path.join(
            confectDirectory,
            generatedTablesDirname,
            `${tm.tableName}.ts`,
          );
          const unnamedAbsolutePath = path.join(
            confectDirectory,
            tm.relativePath,
          );
          const unnamedImportPath = yield* toModuleImportPath(
            path.relative(path.dirname(wrapperPath), unnamedAbsolutePath),
          );
          const contents = yield* templates.tableWrapper({
            tableName: tm.tableName,
            unnamedImportPath,
          });
          yield* writeFileStringAndLog(wrapperPath, contents);
        }),
      { concurrency: "unbounded" },
    );
  });

/**
 * Remove any stale `_generated/tables/*.ts` wrapper whose source table
 * has been deleted or renamed. Mirrors `removeObsoleteRegisteredFunctions`
 * for the wrapper directory.
 */
const removeObsoleteTableWrappers = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const generatedTablesDirname = yield* GENERATED_TABLES_DIRNAME;
    const wrappersDir = path.join(confectDirectory, generatedTablesDirname);

    if (!(yield* fs.exists(wrappersDir))) {
      return;
    }

    const expected = new Set(tableModules.map((tm) => `${tm.tableName}.ts`));
    const existing = yield* fs.readDirectory(wrappersDir, { recursive: true });
    yield* Effect.forEach(existing, (entry) => {
      if (path.extname(entry) !== ".ts") {
        return Effect.void;
      }
      if (!expected.has(entry)) {
        return Effect.gen(function* () {
          const absolutePath = path.join(wrappersDir, entry);
          if (yield* fs.exists(absolutePath)) {
            yield* removePathIfExists(absolutePath);
            yield* logFileRemoved(absolutePath);
          }
        });
      }
      return Effect.void;
    });
  });

const generateRuntimeSchema = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const generatedSchemaPath = yield* GENERATED_SCHEMA_PATH;
    const schemaPath = path.join(confectDirectory, generatedSchemaPath);

    const bindings = yield* tableModuleBindings(tableModules, schemaPath);
    const contents = yield* templates.runtimeSchema({ tableModules: bindings });

    yield* writeFileStringAndLog(schemaPath, contents);
  });

const generateConvexSchema = (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const generatedConvexSchemaPath = yield* GENERATED_CONVEX_SCHEMA_PATH;
    const convexSchemaPath = path.join(
      confectDirectory,
      generatedConvexSchemaPath,
    );

    const bindings = yield* tableModuleBindings(tableModules, convexSchemaPath);
    const contents = yield* templates.convexSchema({ tableModules: bindings });

    yield* writeFileStringAndLog(convexSchemaPath, contents);
  });

const generateConvexSchemaReexport = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;
  const generatedConvexSchemaRelativePath = yield* GENERATED_CONVEX_SCHEMA_PATH;

  const convexSchemaPath = path.join(convexDirectory, "schema.ts");
  const generatedConvexSchemaPath = path.join(
    confectDirectory,
    generatedConvexSchemaRelativePath,
  );

  const convexSchemaImportPath = yield* toModuleImportPath(
    path.relative(path.dirname(convexSchemaPath), generatedConvexSchemaPath),
  );

  const schemaContents = yield* templates.schema({
    convexSchemaImportPath,
  });

  yield* writeFileStringAndLog(convexSchemaPath, schemaContents);
});

const generateServices = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const confectGeneratedDirectory = path.join(confectDirectory, "_generated");

  const servicesPath = path.join(confectGeneratedDirectory, "services.ts");
  const generatedSchemaPath = yield* GENERATED_SCHEMA_PATH;
  const schemaImportPath = yield* toModuleImportPath(
    path.relative(
      path.dirname(servicesPath),
      path.join(confectDirectory, generatedSchemaPath),
    ),
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
  const generatedSpecPath = yield* GENERATED_SPEC_PATH;

  const specImportPath = yield* toModuleImportPath(
    path.relative(refsDir, path.join(confectDirectory, generatedSpecPath)),
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
