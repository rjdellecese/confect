import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  usePaginatedQuery as useConvexPaginatedQuery,
  useQuery as useConvexQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
  type UsePaginatedQueryReturnType,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";

type WithPaginationOpts<Args> = Args & {
  readonly paginationOpts: {
    readonly numItems: number;
    readonly cursor: string | null;
    readonly endCursor?: string | null;
    readonly id?: number;
    readonly maximumRowsRead?: number;
    readonly maximumBytesRead?: number;
  };
};

type PaginatedQueryFunctionReference<Query extends Ref.AnyPublicQuery> =
  PaginatedQueryReference &
    Ref.FunctionReference<
      Ref.Ref<
        Ref.GetRuntimeAndFunctionType<Query>,
        Ref.GetFunctionVisibility<Query>,
        WithPaginationOpts<Ref.Args<Query>>,
        Ref.Returns<Query>
      >
    >;

type UsePaginatedQueryArgs<Query extends Ref.AnyPublicQuery> = Omit<
  Ref.Args<Query>,
  "paginationOpts"
>;

type UsePaginatedQueryReturn<Query extends Ref.AnyPublicQuery> = Omit<
  UsePaginatedQueryReturnType<PaginatedQueryFunctionReference<Query>>,
  "results"
> & {
  results: Ref.Returns<Query> extends {
    readonly page: ReadonlyArray<infer Item>;
  }
    ? Item[]
    : never;
};

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
    encodedArgs as (Ref.EncodedArgs<Query> & Value) | "skip",
  );

  if (encodedReturnsOrUndefined === undefined) {
    return undefined;
  }

  return Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined);
};

export const usePaginatedQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  args: UsePaginatedQueryArgs<Query> | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryReturn<Query> => {
  const functionReference = Ref.getFunctionReference(
    ref,
  ) as unknown as PaginatedQueryFunctionReference<Query>;
  const encodedArgs =
    args === "skip" ? "skip" : Ref.encodePaginatedArgsSync(ref, args);

  const result = useConvexPaginatedQuery(
    functionReference,
    encodedArgs as PaginatedQueryArgs<PaginatedQueryFunctionReference<Query>>,
    options,
  );

  return {
    ...result,
    results: result.results.map((encodedResult) =>
      Ref.decodePageItemSync(ref, encodedResult),
    ),
  } as UsePaginatedQueryReturn<Query>;
};

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualMutation = useConvexMutation(
    functionReference as FunctionReference<"mutation", "public", any, unknown>,
  );

  return (
    ...args: Ref.OptionalArgs<Mutation>
  ): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Mutation>,
    );
    return actualMutation(
      encodedArgs as Ref.EncodedArgs<Mutation> & Value,
    ).then((result) => Ref.decodeReturnsSync(ref, result));
  };
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(
    functionReference as FunctionReference<"action", "public", any, unknown>,
  );

  return (...args: Ref.OptionalArgs<Action>): Promise<Ref.Returns<Action>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Action>,
    );
    return actualAction(encodedArgs as Ref.EncodedArgs<Action> & Value).then(
      (result) => Ref.decodeReturnsSync(ref, result),
    );
  };
};
