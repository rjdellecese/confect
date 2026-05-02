import { Ref } from "@confect/core";
import type {
  OptimisticLocalStore,
  OptimisticUpdate,
} from "convex/browser";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
  type ReactMutation,
} from "convex/react";
import type { FunctionReference } from "convex/server";

type UseQueryArgs<Query extends Ref.AnyPublicQuery> =
  keyof Ref.Args<Query> extends never
    ? [args?: Ref.Args<Query> | "skip"]
    : [args: Ref.Args<Query> | "skip"];

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  ...rest: UseQueryArgs<Query>
): Ref.Returns<Query> | undefined => {
  const functionReference = Ref.getFunctionReference(ref);
  const args = rest[0];
  const encodedArgs =
    args === "skip"
      ? "skip"
      : Ref.encodeArgsSync(ref, (args ?? {}) as Ref.Args<Query>);

  const encodedReturnsOrUndefined = useConvexQuery(
    functionReference,
    encodedArgs,
  );

  if (encodedReturnsOrUndefined === undefined) {
    return undefined;
  }

  return Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined);
};

/**
 * A view of the query results currently in the Convex client for use within
 * optimistic updates. Mirrors {@link OptimisticLocalStore}, but accepts Confect
 * `Ref`s and exposes decoded (Effect Schema) values rather than the encoded
 * wire format.
 */
export interface ConfectOptimisticLocalStore {
  getQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Ref.Returns<Query> | undefined;

  getAllQueries<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
  ): Array<{
    args: Ref.Args<Query>;
    value: Ref.Returns<Query> | undefined;
  }>;

  setQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    args: Ref.Args<Query>,
    value: Ref.Returns<Query> | undefined,
  ): void;
}

export type ConfectOptimisticUpdate<Mutation extends Ref.AnyPublicMutation> = (
  localStore: ConfectOptimisticLocalStore,
  args: Ref.Args<Mutation>,
) => void;

export interface ConfectMutation<Mutation extends Ref.AnyPublicMutation> {
  (...args: Ref.OptionalArgs<Mutation>): Promise<Ref.Returns<Mutation>>;
  withOptimisticUpdate(
    optimisticUpdate: ConfectOptimisticUpdate<Mutation>,
  ): ConfectMutation<Mutation>;
}

const wrapLocalStore = (
  localStore: OptimisticLocalStore,
): ConfectOptimisticLocalStore => ({
  getQuery: (queryRef, ...rest) => {
    const functionReference = Ref.getFunctionReference(
      queryRef,
    ) as FunctionReference<"query">;
    const args = (rest[0] ?? {}) as Ref.Args<typeof queryRef>;
    const encodedArgs = Ref.encodeArgsSync(queryRef, args) as Record<
      string,
      unknown
    >;
    const encoded = localStore.getQuery(functionReference, encodedArgs);
    return encoded === undefined
      ? undefined
      : Ref.decodeReturnsSync(queryRef, encoded);
  },
  setQuery: (queryRef, args, value) => {
    const functionReference = Ref.getFunctionReference(
      queryRef,
    ) as FunctionReference<"query">;
    const encodedArgs = Ref.encodeArgsSync(queryRef, args) as Record<
      string,
      unknown
    >;
    const encodedValue =
      value === undefined ? undefined : Ref.encodeReturnsSync(queryRef, value);
    localStore.setQuery(functionReference, encodedArgs, encodedValue);
  },
  getAllQueries: (queryRef) => {
    const functionReference = Ref.getFunctionReference(
      queryRef,
    ) as FunctionReference<"query">;
    return localStore.getAllQueries(functionReference).map(({ args, value }) => ({
      args: Ref.decodeArgsSync(queryRef, args),
      value:
        value === undefined ? undefined : Ref.decodeReturnsSync(queryRef, value),
    }));
  },
});

const makeConfectMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
  reactMutation: ReactMutation<Ref.FunctionReference<Mutation> & FunctionReference<"mutation">>,
): ConfectMutation<Mutation> => {
  const callable = (
    ...args: Ref.OptionalArgs<Mutation>
  ): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Mutation>,
    );
    return reactMutation(encodedArgs as never).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };

  const withOptimisticUpdate = (
    optimisticUpdate: ConfectOptimisticUpdate<Mutation>,
  ): ConfectMutation<Mutation> => {
    const wrappedUpdate: OptimisticUpdate<never> = (localStore, encodedArgs) => {
      const decodedArgs = Ref.decodeArgsSync(ref, encodedArgs);
      optimisticUpdate(wrapLocalStore(localStore), decodedArgs);
    };
    const nextReactMutation = reactMutation.withOptimisticUpdate(
      wrappedUpdate as never,
    );
    return makeConfectMutation(ref, nextReactMutation);
  };

  return Object.assign(callable, { withOptimisticUpdate });
};

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
): ConfectMutation<Mutation> => {
  const functionReference = Ref.getFunctionReference(ref);
  const reactMutation = useConvexMutation(functionReference);
  return makeConfectMutation(
    ref,
    reactMutation as ReactMutation<
      Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
    >,
  );
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return (...args: Ref.OptionalArgs<Action>): Promise<Ref.Returns<Action>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Action>,
    );
    return actualAction(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};
