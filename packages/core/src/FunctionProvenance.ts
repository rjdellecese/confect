import type { DefaultFunctionArgs } from "convex/server";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import * as Lazy from "./Lazy";
import * as PaginationOptions from "./PaginationOptions";
import * as PaginationResult from "./PaginationResult";

/**
 * A field map accepted as Confect function args. Restricting each field to a
 * context-free codec means the struct assembled from the fields can always be
 * encoded and decoded synchronously at a Convex boundary.
 */
// eslint-disable-next-line import/namespace -- oxlint's namespace resolution misses type-only exports, and `Schema` is an interface/namespace
export type ArgsFields = {
  readonly [key: PropertyKey]: Schema.ConstraintCodec<any, any>;
};

/**
 * A struct-shaped Confect args schema that keeps its exact field map while
 * erasing the rest of `Schema.Struct`'s large implementation type. Decoded and
 * encoded args are derived directly from `ArgsFields_`; keeping the runtime
 * codec structural prevents every ref lookup from expanding the full Effect
 * schema type.
 */
export interface ArgsSchema<
  ArgsFields_ extends ArgsFields,
> extends Schema.Codec<any, any> {
  readonly fields: ArgsFields_;
}

/** Erased structural view used after the exact field map is no longer needed. */
export type AnyArgs = ArgsSchema<ArgsFields>;

export type FunctionProvenance = Data.TaggedEnum<{
  Confect: {
    args: AnyArgs;
    returns: Schema.Codec<any, any>;
    error?: Schema.Codec<any, any>;
    kind: ConfectKind;
  };
  Convex: {
    "~args": DefaultFunctionArgs;
    "~returns": any;
  };
}>;

/**
 * The declaration shape of a Confect function — orthogonal to both the
 * provenance origin (Confect vs Convex) and the function type
 * (query/mutation/action). A `Standard` function declares its args fields and
 * returns schema directly; a `Paginated` function declares user-args fields
 * and an item schema from which the Convex-facing `args`/`returns` are
 * composed.
 */
export type ConfectKind = Standard | Paginated;

export interface Standard {
  readonly _tag: "Standard";
}

export interface Paginated<
  UserArgsFields_ extends ArgsFields = ArgsFields,
  Item extends Schema.Codec<any, any> = Schema.Codec<any, any>,
> {
  readonly _tag: "Paginated";
  /** User-declared args — no `paginationOpts`. */
  readonly userArgs: ArgsSchema<UserArgsFields_>;
  /** Page element schema. */
  readonly item: Item;
  /** Mutable array of items — the page decode target. */
  readonly page: Schema.Codec<any, any>;
}

export interface Confect<
  ArgsFields_ extends ArgsFields,
  Returns extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
  Kind extends ConfectKind = ConfectKind,
> {
  readonly _tag: "Confect";
  readonly "~ArgsFields": ArgsFields_;
  readonly args: ArgsSchema<ArgsFields_>;
  readonly returns: Returns;
  readonly error?: Error;
  readonly kind: Kind;
}

export interface AnyConfect {
  readonly _tag: "Confect";
  readonly args: AnyArgs;
  readonly returns: Schema.Codec<any, any>;
  readonly error?: Schema.Codec<any, any>;
  readonly kind: ConfectKind;
}

export interface Convex<Args extends DefaultFunctionArgs, Returns> {
  readonly _tag: "Convex";
  readonly "~args": Args;
  readonly "~returns": Returns;
}

export interface AnyConvex extends Convex<DefaultFunctionArgs, any> {}

export const FunctionProvenance = Data.taggedEnum<FunctionProvenance>();

const Standard: Standard = { _tag: "Standard" };

/**
 * Build a `Confect` provenance from lazy args-fields and schema thunks.
 * `args`, `returns`, and `error` are exposed as sync lazy memoised getters
 * (via {@link Lazy.defineProperty}) that only evaluate their thunk on first
 * access, mirroring how `Table` defers `Fields`/`Doc`. This keeps importing the
 * assembled `_generated/spec.ts` cheap — no `Schema.Struct(...)` /
 * `Schema.Array(...)` work runs at module load; it is deferred to the first
 * invocation that actually compiles validators or runs a codec.
 *
 * The object is built by hand rather than through `FunctionProvenance.Confect`
 * because the `Data` constructor copies its input with `Object.assign`, which
 * would force the getters at construction time and defeat the laziness.
 * `error` is only installed when an `errorThunk` is provided, so its absence
 * is observable via `"error" in provenance` without forcing anything; nothing
 * relies on `Data`'s structural `Equal`/`Hash` for provenance values.
 */
export const Confect = <
  const ArgsFields_ extends ArgsFields,
  Returns extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
>(
  args: () => ArgsFields_,
  returns: () => Returns,
  error?: () => Error,
): Confect<ArgsFields_, Returns, Error, Standard> => {
  const provenance = { _tag: "Confect" as const, kind: Standard };

  Lazy.defineProperty(provenance, "args", () => Schema.Struct(args()));
  Lazy.defineProperty(provenance, "returns", returns);
  if (error !== undefined) {
    Lazy.defineProperty(provenance, "error", error);
  }

  return provenance as Confect<ArgsFields_, Returns, Error, Standard>;
};

/**
 * The composed args schema of a paginated query: the user-declared fields
 * plus the `paginationOpts` field managed by Convex's pagination protocol.
 *
 * The fields-first representation keeps the user-declared map available for
 * type-level composition without reconstructing it from an erased schema.
 */
export type PaginatedArgsFields<UserArgsFields extends ArgsFields> =
  UserArgsFields & {
    readonly paginationOpts: typeof PaginationOptions.PaginationOptions;
  };

export type PaginatedArgs<UserArgsFields extends ArgsFields> = Schema.Struct<
  PaginatedArgsFields<UserArgsFields>
>;

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
  UserArgsFields extends ArgsFields,
  Item extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
> extends Confect<
  PaginatedArgsFields<UserArgsFields>,
  PaginatedReturns<Item>,
  Error,
  Paginated<UserArgsFields, Item>
> {}

export interface AnyConfectPaginated extends AnyConfect {
  readonly kind: Paginated;
}

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
  const UserArgsFields_ extends ArgsFields,
  Item extends Schema.Codec<any, any>,
  Error extends Schema.Codec<any, any> = never,
>(
  userArgs: () => UserArgsFields_,
  item: () => Item,
  error?: () => Error,
): ConfectPaginated<UserArgsFields_, Item, Error> => {
  const kind = { _tag: "Paginated" as const };
  const paginatedKind = kind as Paginated<UserArgsFields_, Item>;

  Lazy.defineProperty(kind, "userArgs", () => Schema.Struct(userArgs()));
  Lazy.defineProperty(kind, "item", item);
  Lazy.defineProperty(kind, "page", () =>
    Schema.mutable(Schema.Array(paginatedKind.item)),
  );

  const provenance = { _tag: "Confect" as const, kind: paginatedKind };
  const self = provenance as ConfectPaginated<UserArgsFields_, Item, Error>;

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
