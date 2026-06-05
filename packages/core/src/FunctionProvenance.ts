import type { DefaultFunctionArgs } from "convex/server";
import type { Schema } from "effect";
import * as Data from "effect/Data";
import * as Lazy from "./Lazy";

export type FunctionProvenance = Data.TaggedEnum<{
  Confect: {
    args: Schema.Schema.AnyNoContext;
    returns: Schema.Schema.AnyNoContext;
    error?: Schema.Schema.AnyNoContext;
  };
  Convex: {
    /** @internal */
    _args: DefaultFunctionArgs;
    /** @internal */
    _returns: any;
  };
}>;

export interface Confect<
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
  Error extends Schema.Schema.AnyNoContext = never,
> {
  readonly _tag: "Confect";
  readonly args: Args;
  readonly returns: Returns;
  readonly error?: Error;
}

export interface AnyConfect extends Confect<
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface Convex<Args extends DefaultFunctionArgs, Returns> {
  readonly _tag: "Convex";
  readonly _args: Args;
  readonly _returns: Returns;
}

export interface AnyConvex extends Convex<DefaultFunctionArgs, any> {}

export const FunctionProvenance = Data.taggedEnum<FunctionProvenance>();

/**
 * Build a `Confect` provenance from lazy schema thunks. `args`, `returns`,
 * and `error` are exposed as sync lazy memoised getters (via {@link Lazy.defineProperty})
 * that only evaluate their thunk on first access, mirroring how `Table`
 * defers `Fields`/`Doc`/`tableDefinition`. This keeps importing the assembled
 * `_generated/spec.ts` cheap — no `Schema.Struct(...)` / `Schema.Array(...)`
 * work runs at module load; it is deferred to the first invocation that
 * actually compiles validators or runs a codec.
 *
 * The object is built by hand rather than through `FunctionProvenance.Confect`
 * because the `Data` constructor copies its input with `Object.assign`, which
 * would force the getters at construction time and defeat the laziness.
 * `error` is only installed when an `errorThunk` is provided, so its absence
 * is observable via `"error" in provenance` without forcing anything; nothing
 * relies on `Data`'s structural `Equal`/`Hash` for provenance values.
 */
export const Confect = <
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
  Error extends Schema.Schema.AnyNoContext = never,
>(
  args: () => Args,
  returns: () => Returns,
  error?: () => Error,
): Confect<Args, Returns, Error> => {
  const provenance = { _tag: "Confect" as const };

  Lazy.defineProperty(provenance, "args", args);
  Lazy.defineProperty(provenance, "returns", returns);
  if (error !== undefined) {
    Lazy.defineProperty(provenance, "error", error);
  }

  return provenance as Confect<Args, Returns, Error>;
};

export const Convex = <_Args extends DefaultFunctionArgs, _Returns>() =>
  FunctionProvenance.Convex(
    {} as {
      _args: _Args;
      _returns: _Returns;
    },
  );
