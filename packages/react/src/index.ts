import { Ref } from "@confect/core";
import type { OptimisticUpdate as ConvexOptimisticUpdate } from "convex/browser";
import * as ConvexReact from "convex/react";
import type { usePaginatedQuery as useConvexPaginatedQuery } from "convex/react";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
  type ReactMutation as ConvexReactMutation,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { useCallback, useMemo } from "react";

import * as OptimisticLocalStore from "./OptimisticLocalStore";
import * as PaginatedQueryResult from "./PaginatedQueryResult";
import * as QueryResult from "./QueryResult";

export { OptimisticLocalStore, PaginatedQueryResult, QueryResult };

export type InvokeReturn<Ref_ extends Ref.Any> = [Ref.Error<Ref_>] extends [
  never,
]
  ? Promise<Ref.Returns<Ref_>>
  : Promise<Either.Either<Ref.Returns<Ref_>, Ref.Error<Ref_>>>;

type UseQueryArgs<Query extends Ref.AnyPublicQuery> =
  keyof Ref.Args<Query> extends never
    ? [args?: Ref.Args<Query> | "skip"]
    : [args: Ref.Args<Query> | "skip"];

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  ...rest: UseQueryArgs<Query>
): QueryResult.QueryResult<Ref.Returns<Query>, Ref.Error<Query>> => {
  const functionReference = Ref.getFunctionReference(ref);
  const args = rest[0];
  const skipped = args === "skip";
  const encodedArgs = skipped
    ? "skip"
    : Ref.encodeArgsSync(ref, (args ?? {}) as Ref.Args<Query>);

  // `useConvexQuery` returns a referentially stable value while the underlying
  // Convex result is unchanged, and throws a stable error when the query
  // fails. We capture either outcome as an `Either` and decode/wrap it inside
  // `useMemo` so that the returned `QueryResult` keeps a stable identity across
  // renders when nothing has actually changed. Decoding on every render would
  // hand consumers a fresh object each time, breaking effects and memoization
  // that depend on the result's identity.
  const encodedReturnsOrError: Either.Either<unknown, unknown> = Either.try(
    () => useConvexQuery(functionReference, encodedArgs),
  );

  return useMemo(
    () =>
      Either.match(encodedReturnsOrError, {
        onRight: (encodedReturnsOrUndefined) =>
          encodedReturnsOrUndefined === undefined
            ? QueryResult.load(skipped)
            : QueryResult.succeed(
                Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined),
              ),
        onLeft: (error) => {
          if (Ref.isConvexError(error)) {
            const decoded = Ref.decodeErrorSync(ref, error.data);
            if (Option.isSome(decoded)) {
              return QueryResult.fail(decoded.value);
            }
          }
          throw error;
        },
      }),
    // `Either.try` allocates a fresh wrapper each render, so we key the memo on
    // the stable value it carries (the Convex result or thrown error) rather
    // than the wrapper itself; the decoded result is a function of that value,
    // `ref`, and `skipped`.
    [ref, skipped, Either.merge(encodedReturnsOrError)],
  );
};

/**
 * Like `Omit`, but implemented with key remapping so that optional modifiers
 * are preserved and index signatures don't reintroduce the omitted key's
 * literal type. Mirrors `BetterOmit` from `convex/server`.
 */
type OmitKey<T, K extends PropertyKey> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};

/**
 * The args accepted by {@link usePaginatedQuery}: the ref's args without
 * `paginationOpts`, which the underlying Convex hook manages itself. When no
 * args remain, resolves to `Record<string, never>` (only the empty object is
 * accepted) rather than `{}`, which would accept any non-nullish value.
 */
export type PaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  OmitKey<Ref.Args<Query>, "paginationOpts"> extends infer Args_
    ? keyof Args_ extends never
      ? Record<string, never>
      : Args_
    : never;

/**
 * The item type for a paginated query: the element type of the `page` field
 * of the ref's returns.
 */
export type PaginatedQueryItem<Query extends Ref.AnyPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];

/**
 * The args parameter of {@link usePaginatedQuery}: the ref's args without
 * `paginationOpts`, or `"skip"` to skip the query.
 */
export type UsePaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  | PaginatedQueryArgs<Query>
  | "skip";

export type PaginatedQueryOptions = Parameters<
  typeof useConvexPaginatedQuery
>[2];

/**
 * The `user`-facing result of `usePaginatedQueryInternal` from `convex/react`,
 * including the `"Error"` status its non-throwing mode can return.
 */
interface ConvexPaginatedQueryInternalUser {
  readonly results: ReadonlyArray<unknown>;
  readonly status:
    | "LoadingFirstPage"
    | "LoadingMore"
    | "CanLoadMore"
    | "Exhausted"
    | "Error";
  readonly isLoading: boolean;
  readonly loadMore: (numItems: number) => void;
  readonly error?: unknown;
}

type UseConvexPaginatedQueryInternal = (
  query: FunctionReference<"query">,
  args: Record<string, Value> | "skip",
  options: PaginatedQueryOptions,
  throwOnError: boolean,
) => { user: ConvexPaginatedQueryInternalUser };

// `usePaginatedQueryInternal` is runtime-exported by convex/react but absent
// from its public type declarations. It is the only way to observe query
// errors as values: the public positional `usePaginatedQuery` hard-codes
// throwOnError and throws mid-hook-sequence, which cannot be caught without
// breaking React's hook-order invariant. The non-throwing mode (the fourth
// parameter) exists since convex 1.36.0 — the peer floor of this package.
const useConvexPaginatedQueryInternal = (
  ConvexReact as unknown as Record<string, unknown>
).usePaginatedQueryInternal as UseConvexPaginatedQueryInternal | undefined;

/**
 * Load data reactively from a paginated query defined with
 * `FunctionSpec.publicPaginatedQuery`, mirroring the ergonomics of
 * `usePaginatedQuery` from `convex/react`.
 *
 * Args are encoded via the ref's user-args schema (`paginationOpts` is managed
 * by the Convex hook, not the caller), and each loaded page is decoded via the
 * ref's item schema.
 *
 * Returns a {@link PaginatedQueryResult.PaginatedQueryResult}: the loaded
 * variants carry `results`, `isLoading`, and `loadMore`; if the `Ref` declares
 * an `error` schema and the query fails with that typed error, the decoded
 * error is returned as the `Failure` variant. Unknown errors are thrown, to be
 * caught by an error boundary.
 */
export const usePaginatedQuery = <Query extends Ref.AnyPublicPaginatedQuery>(
  ref: Query,
  args: UsePaginatedQueryArgs<Query>,
  options: PaginatedQueryOptions,
): PaginatedQueryResult.PaginatedQueryResult<
  PaginatedQueryItem<Query>,
  Ref.Error<Query>
> => {
  if (useConvexPaginatedQueryInternal === undefined) {
    throw new Error(
      "usePaginatedQuery requires `usePaginatedQueryInternal` from convex/react, " +
        "which ships with convex >= 1.36.0 — upgrade the `convex` package",
    );
  }

  const functionReference = Ref.getFunctionReference(ref);
  const skipped = args === "skip";

  // The encoded output is the wire form Convex's hook forwards verbatim, not
  // the ref's decoded args type.
  const encodedArgs = useMemo(
    () =>
      args === "skip"
        ? ("skip" as const)
        : (Ref.encodePaginatedQueryArgsSync(
            ref,
            args as unknown as Omit<Ref.Args<Query>, "paginationOpts">,
          ) as Record<string, Value>),
    [ref, args],
  );

  const { user: convexResult } = useConvexPaginatedQueryInternal(
    functionReference,
    encodedArgs,
    options,
    false,
  );

  const encodedResults =
    convexResult.status === "Error" ? undefined : convexResult.results;

  // Decoding allocates fresh items, so key on the referentially stable
  // `results` the Convex hook provides — the same identity-preservation
  // rationale as in `useQuery` above.
  const decodedResults = useMemo(
    () =>
      encodedResults === undefined
        ? undefined
        : Ref.decodePaginationPageSync(ref, encodedResults),
    [ref, encodedResults],
  );

  const { status, loadMore } = convexResult;
  const error = status === "Error" ? convexResult.error : undefined;

  return useMemo((): PaginatedQueryResult.Variants<
    PaginatedQueryItem<Query>,
    Ref.Error<Query>
  > => {
    switch (status) {
      case "Error": {
        if (Ref.isConvexError(error)) {
          const decoded = Ref.decodeErrorSync(ref, error.data);
          if (Option.isSome(decoded)) {
            return PaginatedQueryResult.fail(decoded.value);
          }
        }
        // Unknown errors still throw. All hooks have run by this point, so an
        // aborted render here is hook-order-safe.
        throw error;
      }
      case "LoadingFirstPage":
        return PaginatedQueryResult.loadingFirstPage({ skipped, loadMore });
      case "LoadingMore":
        return PaginatedQueryResult.loadingMore({
          results: decodedResults ?? [],
          loadMore,
        });
      case "CanLoadMore":
        return PaginatedQueryResult.canLoadMore({
          results: decodedResults ?? [],
          loadMore,
        });
      case "Exhausted":
        return PaginatedQueryResult.exhausted({
          results: decodedResults ?? [],
          loadMore,
        });
    }
    // The memo produces `Variants`, the conditional return type's superset —
    // when `E` is `never` the `Failure` arm is unreachable at runtime, which
    // is exactly what the conditional encodes.
  }, [
    ref,
    skipped,
    decodedResults,
    status,
    loadMore,
    error,
  ]) as PaginatedQueryResult.PaginatedQueryResult<
    PaginatedQueryItem<Query>,
    Ref.Error<Query>
  >;
};

/**
 * An optimistic update for a Confect mutation. Mirrors Convex's
 * `OptimisticUpdate`, but receives a Confect {@link OptimisticLocalStore} and
 * the decoded mutation `args`.
 */
export type OptimisticUpdate<Mutation extends Ref.AnyPublicMutation> = (
  localStore: OptimisticLocalStore.OptimisticLocalStore,
  args: Ref.Args<Mutation>,
) => void;

/**
 * The handle returned by {@link useMutation}. It is callable like the function
 * returned by Convex's `useMutation`, and additionally exposes
 * `withOptimisticUpdate` for attaching an optimistic update. Mirrors the
 * `ReactMutation` type from `convex/react`.
 */
export interface ReactMutation<Mutation extends Ref.AnyPublicMutation> {
  (...args: Ref.OptionalArgs<Mutation>): InvokeReturn<Mutation>;
  withOptimisticUpdate(
    optimisticUpdate: OptimisticUpdate<Mutation>,
  ): ReactMutation<Mutation>;
}

const makeReactMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
  convexReactMutation: ConvexReactMutation<
    Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
  >,
): ReactMutation<Mutation> => {
  const callable = ((...args: Ref.OptionalArgs<Mutation>) =>
    invokeAsEither(
      ref,
      (_, encodedArgs) => convexReactMutation(encodedArgs as never),
      args,
    ).then((either) =>
      Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
    )) as (...args: Ref.OptionalArgs<Mutation>) => InvokeReturn<Mutation>;

  const withOptimisticUpdate = (
    optimisticUpdate: OptimisticUpdate<Mutation>,
  ): ReactMutation<Mutation> => {
    const wrappedUpdate: ConvexOptimisticUpdate<Record<string, Value>> = (
      convexLocalStore,
      encodedArgs,
    ) => {
      const decodedArgs = Ref.decodeArgsSync(ref, encodedArgs);
      optimisticUpdate(
        OptimisticLocalStore.make(convexLocalStore),
        decodedArgs,
      );
    };
    const nextConvexReactMutation =
      convexReactMutation.withOptimisticUpdate(wrappedUpdate);
    return makeReactMutation(ref, nextConvexReactMutation);
  };

  return Object.assign(callable, { withOptimisticUpdate });
};

/**
 * Returns a {@link ReactMutation} handle for the provided `Ref`'s mutation. The
 * handle is callable to invoke the mutation, and exposes `withOptimisticUpdate`
 * for attaching an optimistic update, mirroring `useMutation` from
 * `convex/react`.
 *
 * If the `Ref` declares an `error` schema, the returned promise resolves to an
 * `Either` with the decoded `returns` value on the right and the decoded error
 * on the left.
 *
 * If the `Ref` does not declare an `error` schema, the promise resolves
 * directly to the decoded `returns` value, matching the behavior of
 * `useMutation` from `convex/react`.
 *
 * Any other failure rejects the promise.
 */
export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
): ReactMutation<Mutation> => {
  const functionReference = Ref.getFunctionReference(ref);
  const convexReactMutation = useConvexMutation(functionReference);

  return useMemo(
    () =>
      makeReactMutation(
        ref,
        convexReactMutation as ConvexReactMutation<
          Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
        >,
      ),
    [ref, convexReactMutation],
  );
};

/**
 * Returns a function that invokes the provided `Ref`'s action.
 *
 * If the `Ref` declares an `error` schema, the returned promise resolves to an
 * `Either` with the decoded `returns` value on the right and the decoded error
 * on the left.
 *
 * If the `Ref` does not declare an `error` schema, the promise resolves
 * directly to the decoded `returns` value, matching the behavior of
 * `useMutation` from `convex/react`.
 *
 * Any other failure rejects the promise.
 */
export const useAction = <Action extends Ref.AnyPublicAction>(
  ref: Action,
): ((...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return useCallback(
    ((...args: Ref.OptionalArgs<Action>) =>
      invokeAsEither(
        ref,
        (_, encodedArgs) => actualAction(encodedArgs),
        args,
      ).then((either) =>
        Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
      )) as (...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>,
    [ref, actualAction],
  );
};

const invokeAsEither = async <Ref_ extends Ref.Any>(
  ref: Ref_,
  invoke: (
    fnRef: Ref.FunctionReference<Ref_>,
    encodedArgs: unknown,
  ) => PromiseLike<unknown>,
  args: Ref.OptionalArgs<Ref_>,
): Promise<Either.Either<Ref.Returns<Ref_>, Ref.Error<Ref_>>> => {
  const exit = await Effect.runPromiseExit(
    Ref.runWithCodec(ref, (args[0] ?? {}) as Ref.Args<Ref_>, invoke).pipe(
      Effect.catchTag("ParseError", Effect.die),
      Effect.either,
    ),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
