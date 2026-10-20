import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import type * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import * as CompiledModule from "./CompiledModule";
import { compile, withBatch as withBundlerBatch } from "./Bundler";

export interface Preparation {
  readonly entry: string;
  readonly roots: ReadonlyArray<string>;
  readonly profile: "modules" | "component-config";
}

export class Service extends Context.Service<
  Service,
  {
    readonly withBatch?: <A, E, R>(
      roots: ReadonlyArray<string>,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | BundlerError, R>;
    readonly prepare: (
      request: Preparation,
    ) => Effect.Effect<
      CompiledModule.NativeArtifact,
      BundlerError,
      Scope.Scope | Path.Path | FileSystem.FileSystem
    >;
  }
>()("@confect/cli/CompilationBackend/Service") {}

export class Roots extends Context.Service<Roots, ReadonlyArray<string>>()(
  "@confect/cli/CompilationBackend/Roots",
) {}

export const withBatch = <A, E, R>(
  roots: ReadonlyArray<string>,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const backend = yield* Effect.serviceOption(Service);
    if (Option.isNone(backend) || !backend.value.withBatch)
      return yield* withBundlerBatch(roots, effect);
    const path = yield* Path.Path;
    const current = yield* Effect.serviceOption(Roots);
    if (
      Option.isSome(current) &&
      roots.every((root) => current.value.includes(path.resolve(root)))
    )
      return yield* effect;
    return yield* backend.value.withBatch(
      roots,
      withBundlerBatch(roots, effect),
    );
  });

export const prepare = Effect.fnUntraced(function* (
  entryPoint: string,
  options?: {
    readonly plugins?: ReadonlyArray<esbuild.Plugin>;
    readonly profile?: "component-config";
  },
): Effect.fn.Return<
  CompiledModule.PreparedModule,
  BundlerError,
  Path.Path | FileSystem.FileSystem | Scope.Scope
> {
  const backend = yield* Effect.serviceOption(Service);
  if (Option.isNone(backend)) return yield* compile(entryPoint, options);
  if (options?.plugins?.length && options.profile !== "component-config")
    return yield* new BundlerError({
      cause: { _tag: "UnsupportedCompilationProfile" },
    });
  const path = yield* Path.Path;
  const entry = path.resolve(entryPoint);
  const batch = yield* Effect.serviceOption(Roots);
  const roots =
    Option.isSome(batch) && batch.value.includes(entry) ? batch.value : [entry];
  const artifactScope = yield* Effect.serviceOption(
    CompiledModule.ArtifactScope,
  );
  const scope = Option.isSome(artifactScope)
    ? artifactScope.value
    : yield* Scope.Scope;
  return yield* backend.value
    .prepare({ entry, roots, profile: options?.profile ?? "modules" })
    .pipe(Effect.provideService(Scope.Scope, scope));
});
