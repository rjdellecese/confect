import type { MutationMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Native Convex metadata for the request that triggered an invocation,
 * including its request ID and, when present, the caller's authentication
 * token.
 *
 * @category Models
 */
export type { RequestMetadata as Metadata } from "convex/server";

const make = (meta: Pick<MutationMeta, "getRequestMetadata">) => ({
  /**
   * Reads the metadata of the originating request, including its request ID,
   * even in a nested mutation or action.
   *
   * **Gotchas**
   *
   * The `authToken` field can contain a raw authentication token. Select the
   * fields you need instead of logging or returning the entire object.
   *
   * @category Getters
   *
   * @returns An Effect producing native request metadata. A Convex rejection is
   *   a defect.
   */
  get: Effect.fn("RequestMetadata.get")(() =>
    Effect.promise(() => meta.getRequestMetadata()),
  ),
});

/**
 * Tag for the service that reads the originating request's metadata. Yield the
 * generated `RequestMetadata` tag in a mutation, action, or HTTP handler.
 *
 * @category Tags
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
