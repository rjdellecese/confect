import * as WebSocketClient from "@confect/js/WebSocketClient";
import type { ConvexClient } from "convex/browser";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

/**
 * Builds the Foldkit-facing Confect client around one WebSocket client. The
 * pagination id allocator shares the WebSocket client's lifetime because its
 * ids are cache-busters for that client's query cache.
 *
 * @internal
 */
export const make = (webSocketClient: WebSocketClient.WebSocketClient) =>
  Effect.gen(function* () {
    const paginationId = yield* Ref.make(0);

    return {
      ...webSocketClient,
      /**
       * @internal
       */
      resolvePaginationId: (restored: Option.Option<number>) =>
        Ref.modify(paginationId, (current) =>
          Option.match(restored, {
            onNone: () => [current + 1, current + 1],
            onSome: (id) => [id, Math.max(current, id)],
          }),
        ),
    };
  });

/**
 * The application-scoped Confect client used by Foldkit Commands and
 * Subscriptions. It combines the WebSocket API with the pagination-session id
 * allocator required by Convex's query cache.
 *
 * Acquire this service to use the inherited `url`, `query`, `mutation`,
 * `action`, `reactiveQuery`, `reactiveQueryResult` and `setAuth` contracts from
 * {@link WebSocketClient.WebSocketClient}. Arguments and results are decoded
 * values. Calls and reactiveQuery fail with declared errors,
 * `WebSocketClientError` or `Schema.SchemaError`; reactiveQueryResult instead
 * emits Result values so a query failure need not close its listener. `setAuth`
 * accepts an effectful token supplier and an optional effectful authentication
 * callback.
 *
 * @category Services
 */
export const Client =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<Effect.Success<ReturnType<typeof make>>>(
    "@confect/foldkit/Client",
  );

/**
 * Effect requirement and acquired service shape for the application resource.
 *
 * @category Services
 */
export type Client = typeof Client.Identifier;

/**
 * Constructs one scoped client for a Foldkit application's `resources`. The
 * connection closes when the resource scope ends. Commands and subscriptions
 * sharing this layer share authentication and pagination ids.
 *
 * @category Layers
 *
 * @example
 *   import * as Client from "@confect/foldkit/Client";
 *
 *   const resources = Client.layer("https://example.convex.cloud");
 *
 * @param address - Convex deployment URL.
 * @param options - Options forwarded unchanged to Convex's `ConvexClient`.
 *
 * @returns A layer providing Client; connection construction errors are
 *   defects.
 */
export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) =>
  Layer.effect(
    Client,
    Effect.flatMap(WebSocketClient.WebSocketClient, make),
  ).pipe(Layer.provide(WebSocketClient.layer(address, options)));

/**
 * Transport or undeclared backend failure from the underlying WebSocket client.
 * Its `cause` preserves the original failure. Commands and subscriptions pass
 * this error to `onError`; pagination includes it in settlement failures.
 *
 * @category Errors
 */
export { WebSocketClientError } from "@confect/js/WebSocketClient";
