import { ConvexReactClient } from "convex/react";
import { FunctionReference } from "convex/server";
import { Effect, ParseResult, Record, Schema } from "effect";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApi from "./ConfectApiSpec";

// TODO: Recurse.
export type ConfectApiClient<
  Api extends ConfectApi.ConfectApiSpec<
    string,
    ConfectApiGroup.ConfectApiGroup.AnyWithProps
  >,
> = {
  [GroupName in keyof Api["groups"]]: {
    [FunctionName in keyof Api["groups"][GroupName]["functions"]]: (
      args: Api["groups"][GroupName]["functions"][FunctionName]["args"]["Type"]
    ) => Effect.Effect<
      Api["groups"][GroupName]["functions"][FunctionName]["returns"]["Type"],
      ParseResult.ParseError
    >;
  };
};

export const make = <
  Api extends ConfectApi.ConfectApiSpec<
    string,
    ConfectApiGroup.ConfectApiGroup.AnyWithProps
  >,
>(
  confectApi: Api,
  convexReactClient: ConvexReactClient
): ConfectApiClient<Api> =>
  Record.map(confectApi.groups, (group) =>
    Record.map(
      group.functions,
      (function_) => (args: unknown) =>
        Effect.gen(function* () {
          const encodedArgs = yield* Schema.encodeUnknown(function_.args)(args);

          const path = ConfectApiFunctionPath.make(
            group.name,
            function_.name
          ) as unknown as FunctionReference<any, any>;

          const result = yield* Effect.promise(() =>
            convexReactClient.query(path, encodedArgs)
          );

          const decodedResult = yield* Schema.decodeUnknown(function_.returns)(
            result
          );

          return decodedResult;
        })
    )
  ) as any;
