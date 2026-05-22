import { DatabaseSchema, GroupSpec, Registry } from "@confect/core";
import { Path } from "@effect/platform";
import { type Context, Effect, Layer, Ref } from "effect";
import type * as esbuild from "esbuild";
import { fromBundlerError } from "./BuildError";
import {
  ImplMissingDefaultLayerError,
  ImplMissingFunctionsError,
  ImplMissingSpecImportError,
  ImplNotFinalizedError,
  SchemaInvalidDefaultExportError,
  SpecMissingDefaultGroupSpecError,
  SpecRuntimeMismatchError,
} from "./CodegenError";
import { ConfectDirectory } from "./ConfectDirectory";
import { isNodeLeafModule } from "./modulePaths";
import { bundleAndImport, bundleAndImportWithInputs } from "./utils";

/**
 * Runtime tag prefix shared by every `Finalized` `GroupImpl` service in
 * `@confect/server`. The CLI walks a built layer's `Context` for this prefix
 * to detect impls that have been correctly piped through `GroupImpl.finalize`.
 *
 * The prefix is hardcoded rather than imported from `@confect/server` to avoid
 * adding a runtime dependency from `@confect/cli` to `@confect/server`. It
 * must stay in sync with the `FINALIZED_TAG_PREFIX` constant exported from
 * `packages/server/src/GroupImpl.ts`.
 */
const FINALIZED_GROUP_IMPL_TAG_PREFIX = "@confect/server/GroupImpl/Finalized/";

const absoluteModulePath = (relativePath: string) =>
  Effect.gen(function* () {
    const confectDirectory = yield* ConfectDirectory.get;
    const path = yield* Path.Path;
    return path.resolve(confectDirectory, relativePath);
  });

const findMetafileInputKey = (
  metafile: esbuild.Metafile,
  absolutePath: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolved = path.resolve(absolutePath);
    return Object.keys(metafile.inputs).find(
      (key) => path.resolve(key) === resolved,
    );
  });

const implDirectlyImportsSpec = (
  metafile: esbuild.Metafile,
  implAbsolutePath: string,
  specAbsolutePath: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const implKey = yield* findMetafileInputKey(metafile, implAbsolutePath);
    const specKey = yield* findMetafileInputKey(metafile, specAbsolutePath);

    if (implKey === undefined || specKey === undefined) {
      return false;
    }

    const specResolved = path.resolve(specKey);
    const implInput = metafile.inputs[implKey];
    if (implInput === undefined) {
      return false;
    }

    return implInput.imports.some(
      (imp) => path.resolve(imp.path) === specResolved,
    );
  });

export const validateSpecModule = (specRelativePath: string) =>
  Effect.gen(function* () {
    const absolutePath = yield* absoluteModulePath(specRelativePath);
    const module = yield* bundleAndImport(absolutePath).pipe(
      Effect.mapError((error) => fromBundlerError(specRelativePath, error)),
    );

    const groupSpec = module.default;

    if (!GroupSpec.isGroupSpec(groupSpec)) {
      return yield* new SpecMissingDefaultGroupSpecError({
        specPath: specRelativePath,
      });
    }

    const expectedRuntime = isNodeLeafModule(specRelativePath)
      ? "Node"
      : "Convex";
    const group = groupSpec as GroupSpec.AnyWithProps;

    if (group.runtime !== expectedRuntime) {
      return yield* new SpecRuntimeMismatchError({
        specPath: specRelativePath,
        expectedRuntime,
        actualRuntime: group.runtime,
      });
    }
  });

export const validateSchemaModule = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const confectSchemaPath = path.join(confectDirectory, "schema.ts");

    yield* bundleAndImport(confectSchemaPath).pipe(
      Effect.mapError((error) => fromBundlerError("schema.ts", error)),
      Effect.andThen((schemaModule) => {
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

const findFinalizedGroupPath = (
  context: Context.Context<unknown>,
): string | undefined => {
  for (const key of context.unsafeMap.keys()) {
    if (key.startsWith(FINALIZED_GROUP_IMPL_TAG_PREFIX)) {
      return key.slice(FINALIZED_GROUP_IMPL_TAG_PREFIX.length);
    }
  }
  return undefined;
};

const collectRegisteredFunctionNames = (
  items: Registry.RegistryItems,
  groupPath: string,
): ReadonlyArray<string> => {
  let node: unknown = items;
  for (const segment of groupPath.split(".")) {
    if (node === null || typeof node !== "object" || !(segment in node)) {
      return [];
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (node === null || typeof node !== "object") {
    return [];
  }
  const names: string[] = [];
  for (const [name, value] of Object.entries(node)) {
    if (
      value !== null &&
      typeof value === "object" &&
      "functionSpec" in value
    ) {
      names.push(name);
    }
  }
  return names;
};

/**
 * Build the impl layer with a fresh `Registry` so that each validation only
 * sees the function items registered by *this* impl. The CLI imports the
 * same `Registry` tag that the bundled `@confect/server`'s `FunctionImpl`
 * writes to, so providing this fresh `Ref` to the build's runtime context
 * causes every `FunctionImpl.make` initializer to populate it.
 */
const buildAndInspectImplLayer = (implLayer: Layer.Layer<unknown>) =>
  Effect.gen(function* () {
    const registry = Ref.unsafeMake<Registry.RegistryItems>({});
    const context = yield* Layer.build(
      implLayer as Layer.Layer<unknown, never, never>,
    ).pipe(Effect.provideService(Registry.Registry, registry));
    const registryItems = yield* Ref.get(registry);
    return { context, registryItems };
  }).pipe(Effect.scoped);

export const validateImplModule = (
  implRelativePath: string,
  specRelativePath: string,
) =>
  Effect.gen(function* () {
    const implAbsolutePath = yield* absoluteModulePath(implRelativePath);
    const specAbsolutePath = yield* absoluteModulePath(specRelativePath);

    const { module, metafile } = yield* bundleAndImportWithInputs(
      implAbsolutePath,
    ).pipe(
      Effect.mapError((error) => fromBundlerError(implRelativePath, error)),
    );

    if (
      !(yield* implDirectlyImportsSpec(
        metafile,
        implAbsolutePath,
        specAbsolutePath,
      ))
    ) {
      return yield* new ImplMissingSpecImportError({
        implPath: implRelativePath,
        expectedSpecPath: specRelativePath,
      });
    }

    if (!Layer.isLayer(module.default)) {
      return yield* new ImplMissingDefaultLayerError({
        implPath: implRelativePath,
      });
    }

    const specModule = yield* bundleAndImport(specAbsolutePath).pipe(
      Effect.mapError((error) => fromBundlerError(specRelativePath, error)),
    );
    const groupSpec = specModule.default as GroupSpec.AnyWithProps;
    const expectedFunctionNames = Object.keys(groupSpec.functions);

    const { context, registryItems } = yield* buildAndInspectImplLayer(
      module.default as Layer.Layer<unknown>,
    );
    const finalizedGroupPath = findFinalizedGroupPath(context);

    if (finalizedGroupPath === undefined) {
      return yield* new ImplNotFinalizedError({
        implPath: implRelativePath,
      });
    }

    const registeredFunctionNames = collectRegisteredFunctionNames(
      registryItems,
      finalizedGroupPath,
    );
    const registeredSet = new Set(registeredFunctionNames);
    const missing = expectedFunctionNames.filter(
      (name) => !registeredSet.has(name),
    );

    if (missing.length > 0) {
      return yield* new ImplMissingFunctionsError({
        implPath: implRelativePath,
        groupPath: finalizedGroupPath,
        missingFunctionNames: missing,
      });
    }
  });
