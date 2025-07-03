import type {
  FunctionReference,
  GenericQueryCtx,
  OptionalRestArgs,
} from "convex/server";
import { Context, Effect } from "effect";

export class ConvexQueryRunner extends Context.Tag(
  "@rjdellecese/confect/ConvexQueryRunner",
)<
  ConvexQueryRunner,
  // TODO: Need to wire in Confect types here, and do decoding/encoding.
  GenericQueryCtx<any>["runQuery"]
>() {
  static provide = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
    Effect.provideService(this, runQuery);
}

export class ConfectQueryRunner extends Effect.Service<ConfectQueryRunner>()(
  "@rjdellecese/confect/ConfectQueryRunner",
  {
    succeed: {
      // TODO: Which errors might occur?
      runQuery: <
        Query extends FunctionReference<"query", "public" | "internal">,
      >(
        query: Query,
        ...args: OptionalRestArgs<Query>
      ) =>
        Effect.gen(function* () {
          const runQuery = yield* ConvexQueryRunner;

          return yield* Effect.promise(() => runQuery(query, ...args));
        }),
    },
  },
) {}
