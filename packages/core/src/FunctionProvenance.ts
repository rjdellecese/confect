import type { DefaultFunctionArgs } from "convex/server";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import * as Lazy from "./Lazy";
import * as PaginationOptions from "./PaginationOptions";
import * as PaginationResult from "./PaginationResult";

export type FunctionProvenance = Data.TaggedEnum<{
  Confect: {
    args: Schema.Codec<any, any>;
    returns: Schema.Codec<any, any>;
    error?: Schema.Codec<any, any>;
    kind: ConfectKind;
  };
  Convex: {
    /** @internal */
    "~args": DefaultFunctionArgs;
    /** @internal */
    "~returns": any;
  };
}>;

/**
 * The declaration shape of a Confect function — orthogonal to both the
 * provenance origin (Confect vs Convex) and the function type
 * (query/mutation/action). A `Standard` function declares its `args` and
 * `returns` schemas directly; a `Paginated` function declares `userArgs` and
 * `item` schemas from which the Convex-facing `args`/`returns` are composed.
 */
export type ConfectKind = Standard | Paginated;

export interface Standard {
  readonly _tag: "Standard";
}

export interface Paginated<
  UserArgs extends AnyUserArgs = AnyUserArgs,
  Item extends Schema.Codec<any, any> = Schema.Codec<any, any>,
> {
  readonly _tag: "Paginated";
  /** User-declared args — no `paginationOpts`. */
  readonly userArgs: UserArgs;
  /** Page element schema. */
  readonly item: Item;
  /** Mutable array of items — the page decode target. */
  readonly page: Schema.Codec<any, any>;
}

export interface Confect<
  Args extends Schema.Codec<any, any>,
  Returns extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
  Kind extends ConfectKind = ConfectKind,
> {
  readonly _tag: "Confect";
  readonly args: Args;
  readonly returns: Returns;
  readonly error?: Error;
  readonly kind: Kind;
}

export interface AnyConfect extends Confect<
  Schema.Codec<any, any>,
  Schema.Codec<any, any>,
  Schema.Codec<any, any>
> {}

export interface Convex<Args extends DefaultFunctionArgs, Returns> {
  readonly _tag: "Convex";
  readonly "~args": Args;
  readonly "~returns": Returns;
}

export interface AnyConvex extends Convex<DefaultFunctionArgs, any> {}

export const FunctionProvenance = Data.taggedEnum<FunctionProvenance>();

const Standard: Standard = { _tag: "Standard" };

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
  Args extends Schema.Codec<any, any>,
  Returns extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
>(
  args: () => Args,
  returns: () => Returns,
  error?: () => Error,
): Confect<Args, Returns, Error, Standard> => {
  const provenance = { _tag: "Confect" as const, kind: Standard };

  Lazy.defineProperty(provenance, "args", args);
  Lazy.defineProperty(provenance, "returns", returns);
  if (error !== undefined) {
    Lazy.defineProperty(provenance, "error", error);
  }

  return provenance as Confect<Args, Returns, Error, Standard>;
};

/**
 * Any struct-shaped, context-free schema usable as a paginated query's user
 * args. A structural bound rather than `Schema.Struct<Schema.Struct.Fields>`
 * because `Schema.Struct` is not covariant in its fields parameter — concrete
 * structs do not extend `Schema.Struct<Schema.Struct.Fields>`.
 */
// eslint-disable-next-line import/namespace -- oxlint's namespace resolution misses type-only exports, and `Schema` is an interface/namespace
export interface AnyUserArgs extends Schema.Codec<any, any> {
  readonly fields: Schema.Struct.Fields;
}

/**
 * The composed args schema of a paginated query: the user-declared fields
 * plus the `paginationOpts` field managed by Convex's pagination protocol.
 *
 * The `extends infer ... extends` conditional lets TypeScript accept the
 * composed struct where `Schema.Codec<any, any>` is required even while
 * `UserArgs` is an unresolved type parameter; for concrete user args it
 * evaluates away entirely.
 */
export type PaginatedArgs<UserArgs extends AnyUserArgs> =
  Schema.Struct<
    UserArgs["fields"] & {
      paginationOpts: typeof PaginationOptions.PaginationOptions;
    }
  > extends infer ComposedArgs extends Schema.Codec<any, any>
    ? ComposedArgs
    : never;

/**
 * The composed returns schema of a paginated query: a `PaginationResult` of
 * the item schema. Same deferred-conditional device as {@link PaginatedArgs}.
 */
export type PaginatedReturns<Item extends Schema.Codec<any, any>> =
  PaginationResult.PaginationResult<Item> extends infer ComposedReturns extends
    Schema.Codec<any, any>
    ? ComposedReturns
    : never;

export interface ConfectPaginated<
  UserArgs extends AnyUserArgs,
  Item extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
> extends Confect<
  PaginatedArgs<UserArgs>,
  PaginatedReturns<Item>,
  Error,
  Paginated<UserArgs, Item>
> {}

export interface AnyConfectPaginated extends ConfectPaginated<
  AnyUserArgs,
  Schema.Codec<any, any>,
  Schema.Codec<any, any>
> {}

/**
 * Build the provenance of a paginated query from lazy schema thunks, with the
 * same laziness contract as {@link Confect}. The user-facing schemas live on
 * the `Paginated` kind (`kind.userArgs`, `kind.item`, `kind.page`) — the kind
 * container is built eagerly (it is cheap) while the schemas inside it stay
 * lazy. The composed Convex-facing `args`/`returns` are derived lazily from
 * them: `args` spreads the user fields plus `paginationOpts`, and `returns`
 * wraps the item in `PaginationResult`. Composition living here means the
 * composed schemas can never drift from the stored user schemas.
 */
export const ConfectPaginated = <
  UserArgs extends AnyUserArgs,
  Item extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
>(
  userArgs: () => UserArgs,
  item: () => Item,
  error?: () => Error,
): ConfectPaginated<UserArgs, Item, Error> => {
  const kind = { _tag: "Paginated" as const };
  const paginatedKind = kind as Paginated<UserArgs, Item>;

  Lazy.defineProperty(kind, "userArgs", userArgs);
  Lazy.defineProperty(kind, "item", item);
  Lazy.defineProperty(kind, "page", () =>
    Schema.mutable(Schema.Array(paginatedKind.item)),
  );

  const provenance = { _tag: "Confect" as const, kind: paginatedKind };
  const self = provenance as ConfectPaginated<UserArgs, Item, Error>;

  Lazy.defineProperty(provenance, "args", () => {
    const fields = paginatedKind.userArgs.fields;
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
    PaginationResult.PaginationResult(paginatedKind.item),
  );
  if (error !== undefined) {
    Lazy.defineProperty(provenance, "error", error);
  }

  return self;
};

export const Convex = <Args extends DefaultFunctionArgs, Returns>() =>
  FunctionProvenance.Convex(
    {} as {
      "~args": Args;
      "~returns": Returns;
    },
  );
