import type { DefaultFunctionArgs } from "convex/server";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import * as Lazy from "./Lazy";
import * as PaginationOptions from "./PaginationOptions";
import * as PaginationResult from "./PaginationResult";

export type FunctionProvenance = Data.TaggedEnum<{
  Confect: {
    args: Schema.Schema.AnyNoContext;
    returns: Schema.Schema.AnyNoContext;
    error?: Schema.Schema.AnyNoContext;
    /** User-declared args of a paginated query — no `paginationOpts`. */
    paginatedUserArgs?: Schema.Schema.AnyNoContext;
    /** Page element schema of a paginated query. */
    paginatedItem?: Schema.Schema.AnyNoContext;
    /** Array-of-items schema of a paginated query — the page decode target. */
    paginatedPage?: Schema.Schema.AnyNoContext;
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

/**
 * Any struct-shaped, context-free schema usable as a paginated query's user
 * args. A structural bound rather than `Schema.Struct<Schema.Struct.Fields>`
 * because `Schema.Struct` is not covariant in its fields parameter — concrete
 * structs do not extend `Schema.Struct<Schema.Struct.Fields>`.
 */
export interface AnyUserArgs extends Schema.Schema.AnyNoContext {
  readonly fields: Schema.Struct.Fields;
}

/**
 * The composed args schema of a paginated query: the user-declared fields
 * plus the `paginationOpts` field managed by Convex's pagination protocol.
 *
 * The `extends infer ... extends` conditional lets TypeScript accept the
 * composed struct where `Schema.Schema.AnyNoContext` is required even while
 * `UserArgs` is an unresolved type parameter; for concrete user args it
 * evaluates away entirely.
 */
export type PaginatedArgs<UserArgs extends AnyUserArgs> =
  Schema.Struct<
    UserArgs["fields"] & {
      paginationOpts: typeof PaginationOptions.PaginationOptions;
    }
  > extends infer ComposedArgs extends Schema.Schema.AnyNoContext
    ? ComposedArgs
    : never;

/**
 * The composed returns schema of a paginated query: a `PaginationResult` of
 * the item schema. Same deferred-conditional device as {@link PaginatedArgs}.
 */
export type PaginatedReturns<Item extends Schema.Schema.AnyNoContext> =
  PaginationResult.PaginationResult<Item> extends infer ComposedReturns extends
    Schema.Schema.AnyNoContext
    ? ComposedReturns
    : never;

export interface ConfectPaginated<
  UserArgs extends AnyUserArgs,
  Item extends Schema.Schema.AnyNoContext,
  Error extends Schema.Schema.AnyNoContext = never,
> extends Confect<PaginatedArgs<UserArgs>, PaginatedReturns<Item>, Error> {
  readonly paginatedUserArgs: UserArgs;
  readonly paginatedItem: Item;
  readonly paginatedPage: Schema.Schema.AnyNoContext;
}

export interface AnyConfectPaginated extends ConfectPaginated<
  AnyUserArgs,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

/**
 * Build the provenance of a paginated query from lazy schema thunks, with the
 * same laziness contract as {@link Confect}. The user-facing schemas
 * (`paginatedUserArgs`, `paginatedItem`) are stored alongside the composed
 * Convex-facing ones (`args`, `returns`), which are derived lazily: `args`
 * spreads the user fields plus `paginationOpts`, and `returns` wraps the item
 * in `PaginationResult`. Composition living here means the composed schemas
 * can never drift from the stored user schemas.
 */
export const ConfectPaginated = <
  UserArgs extends AnyUserArgs,
  Item extends Schema.Schema.AnyNoContext,
  Error extends Schema.Schema.AnyNoContext = never,
>(
  userArgs: () => UserArgs,
  item: () => Item,
  error?: () => Error,
): ConfectPaginated<UserArgs, Item, Error> => {
  const provenance = { _tag: "Confect" as const };
  const self = provenance as ConfectPaginated<UserArgs, Item, Error>;

  Lazy.defineProperty(provenance, "paginatedUserArgs", userArgs);
  Lazy.defineProperty(provenance, "paginatedItem", item);
  Lazy.defineProperty(provenance, "paginatedPage", () =>
    Schema.mutable(Schema.Array(self.paginatedItem)),
  );
  Lazy.defineProperty(provenance, "args", () => {
    const fields = self.paginatedUserArgs.fields;
    if ("paginationOpts" in fields) {
      throw new globalThis.Error(
        "A paginated query's args schema must not declare `paginationOpts` — " +
          "it is added automatically from the `PaginationOptions` schema",
      );
    }
    return Schema.Struct({
      ...fields,
      paginationOpts: PaginationOptions.PaginationOptions,
    });
  });
  Lazy.defineProperty(provenance, "returns", () =>
    PaginationResult.PaginationResult(self.paginatedItem),
  );
  if (error !== undefined) {
    Lazy.defineProperty(provenance, "error", error);
  }

  return self;
};

export const Convex = <_Args extends DefaultFunctionArgs, _Returns>() =>
  FunctionProvenance.Convex(
    {} as {
      _args: _Args;
      _returns: _Returns;
    },
  );
