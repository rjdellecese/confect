import { dynamicImport } from "bundle-require";
import * as Effect from "effect/Effect";
import type * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import { logCoalescedBuildWarnings } from "./log";

export interface CompiledModule {
  readonly url: string;
  readonly metafile: esbuild.Metafile;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

export interface LoadedModule {
  readonly module: any;
  readonly metafile: esbuild.Metafile;
}

export const load = Effect.fn("CompiledModule.load")(function* (
  compiled: CompiledModule,
): Effect.fn.Return<LoadedModule, BundlerError> {
  const module = yield* Effect.tryPromise({
    try: () => dynamicImport(compiled.url, { format: "esm" }),
    catch: (cause) => new BundlerError({ cause }),
  }).pipe(Effect.ensuring(logCoalescedBuildWarnings(compiled.warnings)));
  return { module, metafile: compiled.metafile };
});
