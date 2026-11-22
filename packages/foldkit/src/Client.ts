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
 * Service tag for the application-scoped Confect client that Foldkit commands
 * and subscriptions share.
 *
 * **Details**
 *
 * The service exposes `url`, `query`, `mutation`, `action`, `reactiveQuery`,
 * `reactiveQueryResult`, and `setAuth` from
 * {@link WebSocketClient.WebSocketClient}. Calls accept decoded arguments and
 * return decoded results. One-shot calls and `reactiveQuery` can fail with a
 * declared error, `WebSocketClientError`, or `Schema.SchemaError`;
 * `reactiveQueryResult` emits those failures as values so a listener can
 * recover. `setAuth` takes an effectful token supplier and an optional
 * effectful authentication callback.
 *
 * @category Tags
 *
 * @see {@link layer} provides this service for the application's resources.
 */
export const Client =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<Effect.Success<ReturnType<typeof make>>>(
    "@confect/foldkit/Client",
  );

/**
 * Service type required by Foldkit commands and subscriptions that call
 * Confect.
 *
 * @category Services
 */
export type Client = typeof Client.Identifier;

/**
 * Creates a layer for the Foldkit application's `resources`. Commands and
 * subscriptions that use the same client share its connection, authentication,
 * and pagination IDs. The connection closes when the resource scope ends.
 *
 * **Example** (Sharing a client through Foldkit resources)
 *
 * ```ts
 * import * as Client from "@confect/foldkit/Client";
 *
 * export const resources = Client.layer("https://example.convex.cloud");
 * ```
 *
 * @category Layers
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
