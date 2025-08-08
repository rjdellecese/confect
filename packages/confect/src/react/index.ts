import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import { Effect, Option, Schema } from "effect";

// Type inference from Convex FunctionReference for dynamic API
type InferFunctionArgs<T> = T extends { _args: infer Args } ? Args : any;
type InferFunctionReturns<T> = T extends { _returnType: infer Returns }
  ? Returns
  : any;

// Legacy API overload (original)
export function useQuery<
  Query extends FunctionReference<"query">,
  Args,
  Returns,
>(config: {
  query: Query;
  args: Schema.Schema<Args, Query["_args"]>;
  returns: Schema.Schema<Returns, Query["_returnType"]>;
}): (actualArgs: Args) => Option.Option<Returns>;

// Dynamic API overload (new)
export function useQuery<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject,
  F extends keyof ApiObject[M],
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (
  args: InferFunctionArgs<ApiObject[M][F]>,
) => Option.Option<InferFunctionReturns<ApiObject[M][F]>>;

// Implementation that handles both APIs
export function useQuery(...args: any[]): any {
  // Check if it's the legacy API (single config object)
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    "query" in args[0]
  ) {
    const { query, args: argsSchema, returns } = args[0];

    return (actualArgs: any): Option.Option<any> => {
      const encodedArgs = Schema.encodeSync(argsSchema)(actualArgs);
      const actualReturnsOrUndefined = useConvexQuery(query, encodedArgs);

      if (actualReturnsOrUndefined === undefined) {
        return Option.none();
      }
      const decodedReturns = Schema.decodeSync(returns)(
        actualReturnsOrUndefined,
      );
      return Option.some(decodedReturns);
    };
  }

  // Dynamic API (new)
  if (args.length === 3) {
    const [apiObject, moduleName, functionName] = args;
    const fn = (apiObject[moduleName] as any)[functionName];

    if (!fn) {
      throw new Error(
        `Function not found in ${String(moduleName)}.${String(functionName)}`,
      );
    }

    return (actualArgs: any): Option.Option<any> => {
      const encodedArgs = Schema.encodeSync(Schema.Any)(actualArgs);
      const actualReturnsOrUndefined = useConvexQuery(fn, encodedArgs);

      if (actualReturnsOrUndefined === undefined) {
        return Option.none();
      }
      const decodedReturns = Schema.decodeSync(Schema.Any)(
        actualReturnsOrUndefined,
      );
      return Option.some(decodedReturns);
    };
  }

  throw new Error(
    "Invalid arguments for useQuery. Use either legacy API or dynamic API.",
  );
}

// Legacy API overload (original)
export function useMutation<
  Mutation extends FunctionReference<"mutation">,
  Args,
  Returns,
>(config: {
  mutation: Mutation;
  args: Schema.Schema<Args, Mutation["_args"]>;
  returns: Schema.Schema<Returns, Mutation["_returnType"]>;
}): (actualArgs: Args) => Effect.Effect<Returns>;

// Dynamic API overload (new)
export function useMutation<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject,
  F extends keyof ApiObject[M],
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (
  args: InferFunctionArgs<ApiObject[M][F]>,
) => Effect.Effect<InferFunctionReturns<ApiObject[M][F]>>;

// Implementation that handles both APIs
export function useMutation(...args: any[]): any {
  // Check if it's the legacy API (single config object)
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    "mutation" in args[0]
  ) {
    const { mutation, args: argsSchema, returns } = args[0];
    const actualMutation = useConvexMutation(mutation);

    return (actualArgs: any): Effect.Effect<any> =>
      Effect.gen(function* () {
        const encodedArgs = yield* Schema.encode(argsSchema)(actualArgs);
        const actualReturns = yield* Effect.promise(() =>
          actualMutation(encodedArgs),
        );
        return yield* Schema.decode(returns)(actualReturns);
      }).pipe(Effect.orDie) as any;
  }

  // Dynamic API (new)
  if (args.length === 3) {
    const [apiObject, moduleName, functionName] = args;
    const fn = (apiObject[moduleName] as any)[functionName];

    if (!fn) {
      throw new Error(
        `Function not found in ${String(moduleName)}.${String(functionName)}`,
      );
    }

    const actualMutation = useConvexMutation(fn);

    return (actualArgs: any): Effect.Effect<any> =>
      Effect.gen(function* () {
        const encodedArgs = yield* Schema.encode(Schema.Any)(actualArgs);
        const actualReturns = yield* Effect.promise(() =>
          actualMutation(encodedArgs),
        );
        return yield* Schema.decode(Schema.Any)(actualReturns);
      }).pipe(Effect.orDie);
  }

  throw new Error(
    "Invalid arguments for useMutation. Use either legacy API or dynamic API.",
  );
}

// Legacy API overload (original)
export function useAction<
  Action extends FunctionReference<"action">,
  Args,
  Returns,
>(config: {
  action: Action;
  args: Schema.Schema<Args, Action["_args"]>;
  returns: Schema.Schema<Returns, Action["_returnType"]>;
}): (actualArgs: Args) => Effect.Effect<Returns>;

// Dynamic API overload (new)
export function useAction<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject,
  F extends keyof ApiObject[M],
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (
  args: InferFunctionArgs<ApiObject[M][F]>,
) => Effect.Effect<InferFunctionReturns<ApiObject[M][F]>>;

// Implementation that handles both APIs
export function useAction(...args: any[]): any {
  // Check if it's the legacy API (single config object)
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    "action" in args[0]
  ) {
    const { action, args: argsSchema, returns } = args[0];
    const actualAction = useConvexAction(action);

    return (actualArgs: any): Effect.Effect<any> =>
      Effect.gen(function* () {
        const encodedArgs = yield* Schema.encode(argsSchema)(actualArgs);
        const actualReturns = yield* Effect.promise(() =>
          actualAction(encodedArgs),
        );
        return yield* Schema.decode(returns)(actualReturns);
      }).pipe(Effect.orDie) as any;
  }

  // Dynamic API (new)
  if (args.length === 3) {
    const [apiObject, moduleName, functionName] = args;
    const fn = (apiObject[moduleName] as any)[functionName];

    if (!fn) {
      throw new Error(
        `Function not found in ${String(moduleName)}.${String(functionName)}`,
      );
    }

    const actualAction = useConvexAction(fn);

    return (actualArgs: any): Effect.Effect<any> =>
      Effect.gen(function* () {
        const encodedArgs = yield* Schema.encode(Schema.Any)(actualArgs);
        const actualReturns = yield* Effect.promise(() =>
          actualAction(encodedArgs),
        );
        return yield* Schema.decode(Schema.Any)(actualReturns);
      }).pipe(Effect.orDie) as any;
  }

  throw new Error(
    "Invalid arguments for useAction. Use either legacy API or dynamic API.",
  );
}
