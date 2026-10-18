import { dynamicImport } from "bundle-require";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import type * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import { logCoalescedBuildWarnings } from "./log";

export interface CompiledModule {
  readonly url: string;
  readonly metafile: esbuild.Metafile;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

export class ArtifactScope extends Context.Service<
  ArtifactScope,
  Scope.Scope
>()("@confect/cli/CompiledModule/ArtifactScope") {}

export interface LoadedModule {
  readonly module: any;
  readonly metafile: esbuild.Metafile;
}

export const namespace = Effect.fn("CompiledModule.namespace")((url: string) =>
  Effect.tryPromise({
    try: () => dynamicImport(url, { format: "esm" }),
    catch: (cause) => new BundlerError({ cause }),
  }).pipe(
    Effect.flatMap((module) =>
      Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
        module,
      ).pipe(Effect.mapError((cause) => new BundlerError({ cause }))),
    ),
  ),
);

export const load = Effect.fn("CompiledModule.load")(function* (
  compiled: CompiledModule,
): Effect.fn.Return<LoadedModule, BundlerError> {
  const module = yield* namespace(compiled.url).pipe(
    Effect.ensuring(logCoalescedBuildWarnings(compiled.warnings)),
  );
  return { module, metafile: compiled.metafile };
});
