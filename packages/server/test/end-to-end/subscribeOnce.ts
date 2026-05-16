import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { Effect } from "effect";

class ConvexSubscriptionError extends Error {
  readonly _tag = "ConvexSubscriptionError";
}

/**
 * Open a fresh `ConvexClient`, subscribe to `functionName`, await the first
 * emitted value, and close the client. Each call goes through real session
 * boundaries on the backend so cache lookups exercise the same code paths
 * the issue reporter hit from the Convex dashboard.
 */
export const subscribeOnce = <A>(
  url: string,
  functionName: string,
): Effect.Effect<A, ConvexSubscriptionError> =>
  Effect.acquireUseRelease(
    Effect.sync(() => new ConvexClient(url)),
    (client) =>
      Effect.async<A, ConvexSubscriptionError>((resume) => {
        const reference = makeFunctionReference<"query">(functionName);
        const unsubscribe = client.onUpdate(
          reference,
          {},
          (value) => {
            unsubscribe();
            resume(Effect.succeed(value as A));
          },
          (error) => {
            unsubscribe();
            resume(
              Effect.fail(
                new ConvexSubscriptionError(
                  `subscription to ${functionName} failed: ${String(error)}`,
                ),
              ),
            );
          },
        );
        return Effect.sync(() => unsubscribe());
      }),
    (client) => Effect.promise(() => client.close()),
  );
