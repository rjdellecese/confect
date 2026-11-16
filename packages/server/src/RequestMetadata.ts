import type { MutationMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Native Convex request metadata returned by the service's get method.
 *
 * @category Models
 */
export type { RequestMetadata as Metadata } from "convex/server";

const make = (meta: Pick<MutationMeta, "getRequestMetadata">) => ({
  /**
   * Read metadata for the request that triggered this invocation.
   *
   * @category Getters
   *
   * @returns An Effect producing native request metadata; native rejection is a
   *   defect. Never log or return the sensitive authToken field.
   */
  get: Effect.fn("RequestMetadata.get")(() =>
    Effect.promise(() => meta.getRequestMetadata()),
  ),
});

/**
 * Request metadata service available in mutations, actions and HTTP handlers.
 * Acquire the application's generated `RequestMetadata` tag.
 *
 * @category Services
 */
export class RequestMetadata extends Context.Service<
  RequestMetadata,
  ReturnType<typeof make>
>()("@confect/server/RequestMetadata") {}

/**
 * @internal
 */
export const layer = (meta: Pick<MutationMeta, "getRequestMetadata">) =>
  Layer.succeed(RequestMetadata, make(meta));
