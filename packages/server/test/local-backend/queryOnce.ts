import { Ref } from "@confect/core";
import type { ConvexHttpClient } from "convex/browser";
import { Effect, Schema } from "effect";

class ConvexQueryError extends Schema.TaggedError<ConvexQueryError>()(
  "ConvexQueryError",
  { message: Schema.String },
) {}

/**
 * Run a Confect query once over HTTP. Accepts a Confect `Ref` so the return
 * type is inferred at the call site via `Ref.Returns<R>`.
 */
export const queryOnce = <R extends Ref.AnyPublicQuery>(
  client: ConvexHttpClient,
  ref: R,
  ...args: Ref.OptionalArgs<R>
): Effect.Effect<Ref.Returns<R>, ConvexQueryError> =>
  Effect.tryPromise({
    try: () =>
      client.query(Ref.getFunctionReference(ref), (args[0] ?? {}) as never),
    catch: (error) =>
      new ConvexQueryError({ message: `query failed: ${String(error)}` }),
  });
