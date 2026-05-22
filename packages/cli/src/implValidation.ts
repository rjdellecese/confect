import { GroupSpec, Registry } from "@confect/core";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as GroupImpl from "@confect/server/GroupImpl";
import { Path } from "@effect/platform";
import type { Context } from "effect";
import { Array, Effect, Layer, Option, Ref } from "effect";
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

/**
 * Walk the built `Context` for a `Finalized` `GroupImpl` service value. The
 * lookup is value-shaped (via `GroupImpl.isFinalizedGroupImpl`) so we don't
 * need to know the group's path up front to construct a typed tag for it.
 */
const findFinalizedGroupImpl = <S>(
  context: Context.Context<S>,
): Option.Option<GroupImpl.AnyFinalized> =>
  Array.findFirst(context.unsafeMap.values(), GroupImpl.isFinalizedGroupImpl);

/**
 * Build the impl layer with a fresh `Registry` so each validation is
 * isolated from prior validations' `FunctionImpl.make` writes. The CLI no
 * longer reads the registry directly — `GroupImpl.finalize` snapshots the
 * registered function names onto the produced `Finalized` `GroupImpl`
 * service value — but a fresh `Ref` is still required because the default
 * `Context.Reference` is cached globally and would otherwise accumulate
 * items across impls.
 */
const buildImplLayer = (implLayer: Layer.Layer<unknown>) =>
  Effect.gen(function* () {
    const registry = Ref.unsafeMake<Registry.RegistryItems>({});
    return yield* Layer.build(
      implLayer as Layer.Layer<unknown, never, never>,
    ).pipe(Effect.provideService(Registry.Registry, registry));
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

    const context = yield* buildImplLayer(
      module.default as Layer.Layer<unknown>,
    );
    const finalizedGroupImplOption = findFinalizedGroupImpl(context);

    if (Option.isNone(finalizedGroupImplOption)) {
      return yield* new ImplNotFinalizedError({
        implPath: implRelativePath,
      });
    }
    const finalizedGroupImpl = finalizedGroupImplOption.value;

    const registeredSet = new Set(finalizedGroupImpl.registeredFunctionNames);
    const missing = expectedFunctionNames.filter(
      (name) => !registeredSet.has(name),
    );

    if (missing.length > 0) {
      return yield* new ImplMissingFunctionsError({
        implPath: implRelativePath,
        groupPath: finalizedGroupImpl.groupPath,
        missingFunctionNames: missing,
      });
    }
  });
