import { GroupSpec } from "@confect/core";
import { Path } from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import type * as esbuild from "esbuild";
import { ConfectDirectory } from "./ConfectDirectory";
import { isNodeLeafModule } from "./modulePaths";
import { bundleAndImport, bundleAndImportWithInputs } from "./utils";

export class ImplValidationError extends Schema.TaggedError<ImplValidationError>()(
  "ImplValidationError",
  {
    file: Schema.String,
    reason: Schema.String,
  },
) {
  override get message(): string {
    return `${this.file}: ${this.reason}`;
  }
}

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
      Effect.mapError(
        (error) =>
          new ImplValidationError({
            file: specRelativePath,
            reason: `failed to load spec module: ${String(error)}`,
          }),
      ),
    );

    const groupSpec = module.default;

    if (!GroupSpec.isGroupSpec(groupSpec)) {
      return yield* new ImplValidationError({
        file: specRelativePath,
        reason: "must default-export GroupSpec.make() or GroupSpec.makeNode()",
      });
    }

    const expectedRuntime = isNodeLeafModule(specRelativePath)
      ? "Node"
      : "Convex";
    const group = groupSpec as GroupSpec.AnyWithProps;

    if (group.runtime !== expectedRuntime) {
      return yield* new ImplValidationError({
        file: specRelativePath,
        reason: `expected GroupSpec runtime "${expectedRuntime}", got "${group.runtime}"`,
      });
    }
  });

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
      Effect.mapError(
        (error) =>
          new ImplValidationError({
            file: implRelativePath,
            reason: `failed to load impl module: ${String(error)}`,
          }),
      ),
    );

    if (
      !(yield* implDirectlyImportsSpec(
        metafile,
        implAbsolutePath,
        specAbsolutePath,
      ))
    ) {
      return yield* new ImplValidationError({
        file: implRelativePath,
        reason: `must import sibling spec "${specRelativePath}"`,
      });
    }

    if (!Layer.isLayer(module.default)) {
      return yield* new ImplValidationError({
        file: implRelativePath,
        reason: "must default-export a GroupImpl layer",
      });
    }
  });
