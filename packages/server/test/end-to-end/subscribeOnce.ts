import type { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

/**
 * Subscribe to a query, await the first emitted value, unsubscribe, and resolve.
 *
 * Each test call uses a fresh `ConvexClient` so that cache lookups go through
 * real session boundaries on the backend.
 */
export const subscribeOnce = <A>(
  client: ConvexClient,
  functionName: string,
): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    const reference = makeFunctionReference<"query">(functionName);
    const unsubscribe = client.onUpdate(
      reference,
      {},
      (value) => {
        unsubscribe();
        resolve(value as A);
      },
      reject,
    );
  });
