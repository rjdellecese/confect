import * as Brand from "effect/Brand";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";
import type * as esbuild from "esbuild";
import type { BundlerError } from "./BuildError";
import type * as CompilationInputs from "./CompilationInputs";

export type ResolutionScope = string & Brand.Brand<"ResolutionScope">;
const ResolutionScope = Brand.nominal<ResolutionScope>();

export type Boundary = Data.TaggedEnum<{
  Stop: { readonly directory: string };
  Continue: { readonly parent: string };
}>;
export const Boundary = Data.taggedEnum<Boundary>();

export type Lookup = Data.TaggedEnum<{
  Local: { readonly key: string };
  Shared: {
    readonly scope: ResolutionScope;
    readonly specifier: string;
    readonly kind: esbuild.OnResolveArgs["kind"];
    readonly namespace: string;
  };
}>;
const Lookup = Data.taggedEnum<Lookup>();

export const localKey = (
  path: Path.Path,
  args: esbuild.OnResolveArgs,
): string =>
  `${path.dirname(args.importer)}\0${args.path}\0${args.resolveDir}\0${args.kind}\0${args.namespace}`;

export const key = Lookup.$match({
  Local: ({ key: local }) => local,
  Shared: ({ scope, specifier, kind, namespace }) =>
    `${scope}\0${specifier}\0${scope}\0${kind}\0${namespace}`,
});

export const make = Effect.fn("ResolutionScope.make")(function* (
  path: Path.Path,
  inputs: Pick<CompilationInputs.Inputs, "resolutionBoundary">,
) {
  const scopes = yield* Ref.make(
    HashMap.empty<
      string,
      {
        readonly run: Effect.Effect<
          ResolutionScope,
          BundlerError | CompilationInputs.RestartRequired
        >;
      }
    >(),
  );
  const lock = yield* Semaphore.make(1);
  const resolve = Effect.fn("ResolutionScope.resolve")(function* (
    directory: string,
  ): Effect.fn.Return<
    ResolutionScope,
    BundlerError | CompilationInputs.RestartRequired
  > {
    const cached = yield* lock.withPermit(
      Effect.gen(function* () {
        const previous = HashMap.get(yield* Ref.get(scopes), directory);
        if (Option.isSome(previous)) return previous.value;
        const run = yield* Effect.cached(
          inputs.resolutionBoundary(directory).pipe(
            Effect.flatMap(
              Boundary.$match({
                Stop: ({ directory: boundary }) =>
                  Effect.succeed(ResolutionScope(boundary)),
                Continue: ({ parent }) => resolve(parent),
              }),
            ),
          ),
        );
        const entry = { run };
        yield* Ref.update(scopes, HashMap.set(directory, entry));
        return entry;
      }),
    );
    return yield* cached.run;
  });
  return {
    clear: Ref.set(scopes, HashMap.empty()),
    lookup: Effect.fn("ResolutionScope.lookup")(function* (
      args: esbuild.OnResolveArgs,
      enabled: boolean,
    ): Effect.fn.Return<
      Lookup,
      BundlerError | CompilationInputs.RestartRequired
    > {
      const directory = path.dirname(args.importer);
      if (
        !enabled ||
        !(
          args.kind === "import-statement" ||
          args.kind === "dynamic-import" ||
          args.kind === "require-call" ||
          args.kind === "require-resolve"
        ) ||
        directory !== args.resolveDir ||
        args.path.startsWith(".") ||
        args.path.startsWith("#") ||
        args.path.includes(":") ||
        path.isAbsolute(args.path)
      )
        return Lookup.Local({ key: localKey(path, args) });
      return Lookup.Shared({
        scope: yield* resolve(directory),
        specifier: args.path,
        kind: args.kind,
        namespace: args.namespace,
      });
    }),
  };
});
