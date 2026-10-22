import * as Command from "effect/cli/Command";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as HashMap from "effect/HashMap";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as EvaluationSession from "../EvaluationSession";
import * as Bundler from "../Bundler";
import * as CompiledModule from "../CompiledModule";
import * as CompilationSession from "../CompilationSession";
import { fromBundlerError } from "../BuildError";
import * as CodegenError from "../CodegenError";
import { LegacySchemaFileError } from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import * as ConvexConfig from "../ConvexConfig";
import { ConvexDirectory } from "../ConvexDirectory";
import * as DocName from "../DocName";
import * as FunctionPaths from "../FunctionPaths";
import * as FunctionModule from "../FunctionModule";
import * as GenerationSnapshot from "../GenerationSnapshot";
import * as GenerationRecord from "../GenerationRecord";
import * as OutputPlan from "../OutputPlan";
import * as OutputPublisher from "../OutputPublisher";
import * as RegisteredFunctions from "../RegisteredFunctions";
import * as ReferenceBindings from "../ReferenceBindings";
import * as StaticBindings from "../StaticBindings";
import * as EntryPoint from "../EntryPoint";
import type { ImplModulePath } from "../ImplModulePath";
import { implPathForSpec } from "../LeafModule";
import {
  logFileAdded,
  logFileModified,
  logFileRemoved,
  logPending,
  logSuccess,
  logWarn,
  logCoalescedBuildWarnings,
} from "../log";
import { ProjectRoot } from "../ProjectRoot";
import { SpecModulePath } from "../SpecModulePath";
import * as TableModule from "../TableModule";
import * as templates from "../templates";
import {
  generateAuthConfig,
  generateCrons,
  generateHttp,
  removePathIfExists,
  toModuleImportPath,
  touchConvexSchema,
  writeFileStringAndLog,
} from "../utils";

const GENERATED_DIRNAME = "_generated";

const GENERATED_CONVEX_SCHEMA_PATH = Effect.map(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "convexSchema.ts"),
);
const GENERATED_COMPONENTS_PATH = Effect.map(Path.Path, (path) =>
  path.join(GENERATED_DIRNAME, "components.ts"),
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
    // `_generated/nodeSpec.ts` is not part of the generated output (all groups
    // live in `_generated/spec.ts`); delete any copy left by an older version.
    path.join(GENERATED_DIRNAME, "nodeSpec.ts"),
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

const runCodegen = Effect.gen(function* () {
  const scopedRefFiles = yield* OutputPublisher.discover("ScopedRef");
  yield* rejectLegacySchemaFile;
  const tableModules = yield* TableModule.discover;
  yield* validateNoDocNameCollisions(tableModules);
  const leaves = yield* EvaluationSession.discoverLeaves;
  yield* Effect.forEach(leaves, ({ relativePath }) =>
    Effect.fromResult(
      GenerationSnapshot.parseRootPath(relativePath.replaceAll("\\", "/")),
    ),
  );
  const specPaths = leaves.map((leaf) =>
    SpecModulePath.make(leaf.relativePath),
  );
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const implPaths = yield* Effect.forEach(specPaths, implPathForSpec).pipe(
    Effect.flatMap((paths) =>
      Effect.filter(paths, (file) =>
        fs.exists(path.resolve(confectDirectory, file)),
      ),
    ),
  );
  yield* warnIfNoTables(tableModules);
  const staticBindings = yield* StaticBindings.renderPlan(tableModules);
  const ownedTables = yield* OutputPublisher.discover("TableWrapper");
  const staticPlan = yield* Effect.fromResult(
    OutputPlan.diff(
      Array.filter(
        staticBindings.operations,
        OutputPlan.Operation.$is("Write"),
      ),
      ownedTables,
    ),
  );
  const referenceBindings = yield* ReferenceBindings.renderPlan(leaves);
  const specPlan = yield* Effect.fromResult(
    OutputPlan.make(
      referenceBindings.operations.filter(
        ({ target }) =>
          target._tag === "Binding" && target.relativePath === "spec.ts",
      ),
    ),
  );
  const refsPlan = yield* Effect.fromResult(
    OutputPlan.diff(
      Array.filter(
        referenceBindings.operations,
        OutputPlan.Operation.$is("Write"),
      ).filter(
        ({ target }) =>
          target._tag !== "Binding" || target.relativePath !== "spec.ts",
      ),
      scopedRefFiles,
    ),
  );
  yield* generateConfectGeneratedDirectory;
  yield* OutputPublisher.publish(staticPlan);
  yield* removeLegacyFiles;
  yield* OutputPublisher.publish(specPlan);
  // `_generated/api.ts`/`nodeApi.ts` are no longer imported by generated or
  // impl code (impls take the database schema from `_generated/schema`
  // directly), so remove any copies left over from earlier versions before
  // impl validation runs.
  yield* Effect.all(
    [
      removeGeneratedApi,
      OutputPublisher.publish(refsPlan),
      removeGeneratedNodeApi,
      // Must land before impl validation: impls may import the generated
      // components registry, so it has to exist when their bundles are built.
      generateComponents,
    ],
    { concurrency: "unbounded" },
  );
  yield* EvaluationSession.validateTables(tableModules);
  const snapshot = yield* EvaluationSession.withBatch(
    [...specPaths, ...implPaths],
    Effect.gen(function* () {
      yield* EvaluationSession.loadSpecs(specPaths);
      yield* EvaluationSession.validateSiblings(leaves);
      const inspected = yield* EvaluationSession.snapshot(specPaths);
      yield* EvaluationSession.validateImpls(leaves);
      return inspected;
    }),
  );
  const ownedRegistries = yield* OutputPublisher.discover("Registry");
  const ownedModules = yield* OutputPublisher.discover("ConvexModule");
  const registries = yield* RegisteredFunctions.renderPlan(snapshot.leaves);
  const modules = yield* FunctionModule.renderPlan(
    GenerationSnapshot.plan(snapshot, []),
  );
  const outputPlan = yield* Effect.fromResult(
    OutputPlan.diff(
      Array.filter(
        [...registries.operations, ...modules.operations],
        OutputPlan.Operation.$is("Write"),
      ),
      [...ownedRegistries, ...ownedModules],
    ),
  );
  yield* OutputPublisher.publish(outputPlan);
  yield* Effect.all(
    [
      generateConvexSchemaReexport,
      logGenerated(generateHttp),
      logGenerated(generateCrons),
      logGenerated(generateAuthConfig),
    ],
    { concurrency: "unbounded" },
  );
  yield* compileOptionalModules;
  return {
    functionPaths: GenerationSnapshot.functionPaths(snapshot),
    snapshot,
  };
});

export const generateWithSnapshot = runCodegen.pipe(
  EvaluationSession.provide,
  Effect.withSpan("Cli.codegen"),
);

export const codegenHandler = generateWithSnapshot.pipe(
  Effect.tap(() => touchConvexSchema),
  Effect.tap(({ snapshot }) => GenerationRecord.write(snapshot)),
  Effect.map(({ functionPaths }) => ({ functionPaths })),
  Effect.provide(CompilationSession.layer("Once")),
);

export const compileOptionalModules = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const paths = yield* Effect.filter(
    ["http.ts", "crons.ts", "auth.ts"],
    (relativePath) => fs.exists(path.resolve(confectDirectory, relativePath)),
  );
  yield* Bundler.withBatch(
    paths.map((relativePath) => path.resolve(confectDirectory, relativePath)),
    Effect.forEach(
      paths,
      (relativePath) =>
        Effect.gen(function* () {
          const artifact = yield* Bundler.compile(
            path.resolve(confectDirectory, relativePath),
          ).pipe(
            Effect.mapError((error) => fromBundlerError(relativePath, error)),
          );
          yield* logCoalescedBuildWarnings(artifact.warnings);
          yield* CompiledModule.consume(artifact);
        }),
      { concurrency: 4, discard: true },
    ),
  );
}).pipe(Effect.scoped);

export const updateDeclarations = Effect.fn("Cli.updateDeclarations")(
  function* (
    snapshot: GenerationSnapshot.GenerationSnapshot,
    declarations: Array.NonEmptyReadonlyArray<EntryPoint.Declaration>,
    affectedImpls: ReadonlyArray<ImplModulePath>,
  ) {
    const path = yield* Path.Path;
    const { paths, tables } = EntryPoint.planDeclarations(
      declarations,
      affectedImpls,
      path,
    );
    yield* EvaluationSession.validateTables(tables);
    return yield* EvaluationSession.withImplFiles(paths, (leaves) =>
      Effect.gen(function* () {
        const next = yield* EvaluationSession.snapshot(
          leaves.map((leaf) => SpecModulePath.make(leaf.relativePath)),
          snapshot,
        );
        yield* EvaluationSession.validateImpls(leaves);
        const updatedPaths = HashSet.fromIterable(
          Array.map(leaves, (leaf) => leaf.relativePath.replaceAll("\\", "/")),
        );
        const registries = yield* RegisteredFunctions.renderPlan(
          HashMap.filter(next.leaves, (_, relativePath) =>
            HashSet.has(updatedPaths, relativePath),
          ),
        );
        const modules = yield* FunctionModule.renderPlan(
          GenerationSnapshot.diff(snapshot, next),
        );
        const outputPlan = yield* Effect.fromResult(
          OutputPlan.make([...registries.operations, ...modules.operations]),
        );
        yield* OutputPublisher.publish(outputPlan);
        return next;
      }),
    );
  },
  EvaluationSession.provide,
);

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

const removeLegacyFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const legacyPaths = yield* LEGACY_PATHS;

  yield* Effect.forEach(
    legacyPaths,
    Effect.fnUntraced(function* (relativePath: string) {
      const absolutePath = path.join(confectDirectory, relativePath);
      if (yield* fs.exists(absolutePath)) {
        yield* removePathIfExists(absolutePath);
        yield* logFileRemoved(absolutePath);
      }
    }),
  );
});

const emptyFunctionPaths = FunctionPaths.FunctionPaths.make(HashSet.empty());

export const loadPreviousFunctionPaths = Effect.gen(function* () {
  const history = yield* GenerationRecord.read;
  return yield* GenerationRecord.History.$match(history, {
    Missing: () => Effect.succeed(emptyFunctionPaths),
    Malformed: () =>
      logWarn(
        "Ignoring malformed generation history; performing full initial generation.",
      ).pipe(Effect.as(emptyFunctionPaths)),
    Unsupported: () =>
      logWarn(
        "Ignoring unsupported generation history version; performing full initial generation.",
      ).pipe(Effect.as(emptyFunctionPaths)),
    Loaded: ({ record }) =>
      Effect.succeed(GenerationSnapshot.functionPaths(record.snapshot)),
  });
});

/**
 * Remove a now-obsolete `_generated/<name>.ts` if present (and log it), for
 * projects upgrading from a version that still emitted it.
 */
const removeObsoleteGeneratedFile = Effect.fnUntraced(function* (
  fileName: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const filePath = path.join(confectDirectory, "_generated", fileName);

  if (yield* fs.exists(filePath)) {
    yield* removePathIfExists(filePath);
    yield* logFileRemoved(filePath);
  }
});

// `_generated/api.ts` is no longer imported by generated or impl code: impls
// take the database schema (`_generated/schema`) directly, and per-group
// registries reference the spec type-only. Remove any stale copy.
const removeGeneratedApi = removeObsoleteGeneratedFile("api.ts");

// `_generated/nodeApi.ts` is obsolete for the same reason.
const removeGeneratedNodeApi = removeObsoleteGeneratedFile("nodeApi.ts");

/**
 * The user-authored `confect/schema.ts` is no longer supported: codegen now
 * owns both `_generated/schema.ts` (runtime) and `_generated/convexSchema.ts`
 * (deploy), derived from a single scan of `confect/tables/*.ts`. Detect a stray
 * file and fail with a clear migration message—leaving it in place would
 * silently shadow the codegen-owned
 * `_generated/schema.ts`/`_generated/convexSchema.ts`.
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
 * Surface a yellow `⚠` warning when codegen sees no tables—either the
 * `confect/tables/` directory is missing or it contains no `.ts` files.
 * Generation still succeeds (emitting an empty `DatabaseSchema` and
 * `defineSchema({})`), since action-only/table-free Confect backends are
 * legal—but the warning catches the much more common case of a typoed directory
 * or files placed under the wrong root.
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

/**
 * Two tables whose names fold to the same PascalCase document type name (e.g.
 * `user_profiles` and `userProfiles` → `UserProfilesDoc`) would emit duplicate
 * interfaces in `_generated/docs.ts`. Catch that up front with a clear error
 * rather than letting `tsc` report a duplicate-identifier later.
 */
const validateNoDocNameCollisions = Effect.fnUntraced(function* (
  tableModules: ReadonlyArray<TableModule.TableModule>,
) {
  const collisions = pipe(
    tableModules,
    Array.groupBy((tableModule) =>
      DocName.fromTableName(tableModule.tableName),
    ),
    Record.toEntries,
    Array.filter(([, group]) => group.length > 1),
    Array.map(([docName, group]) => ({
      docName,
      tableNames: Array.map(group, (tableModule) => tableModule.tableName),
    })),
  );

  if (Array.isReadonlyArrayNonEmpty(collisions)) {
    return yield* new CodegenError.ConflictingDocNameError({ collisions });
  }
});

/**
 * Generate `confect/_generated/components.ts`—the typed registry of Convex
 * components installed in `convex/convex.config.ts` (see
 * {@link templates.components}). The file is emitted even when there is no
 * `convex.config.ts` (as an empty registry) so the import surface stays stable.
 * It must exist before impl validation because impl modules may import it.
 */
export const generateComponents = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const convexDirectory = yield* ConvexDirectory.get;
  const projectRoot = yield* ProjectRoot.get;

  const confectGeneratedDirectory = path.join(
    confectDirectory,
    GENERATED_DIRNAME,
  );
  const generatedComponentsPath = yield* GENERATED_COMPONENTS_PATH;
  const componentsPath = path.join(confectDirectory, generatedComponentsPath);

  const convexConfigPath = path.join(
    convexDirectory,
    ConvexConfig.CONVEX_CONFIG_FILENAME,
  );

  const installedComponents = (yield* fs.exists(convexConfigPath))
    ? yield* EvaluationSession.components(
        convexConfigPath,
        path.relative(projectRoot, convexConfigPath),
      )
    : [];

  const contents = yield* templates.components({
    components: Array.map(
      installedComponents,
      ({ name, componentDefinitionPath }) => ({
        name,
        typeImportPath: ConvexConfig.typeImportPath(
          path,
          componentDefinitionPath,
          confectGeneratedDirectory,
        ),
      }),
    ),
  });

  yield* writeFileStringAndLog(componentsPath, contents);
}).pipe(EvaluationSession.provide);

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
