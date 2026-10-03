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
 */
export const make = (webSocketClient: WebSocketClient.WebSocketClient) =>
  Effect.gen(function* () {
    const paginationId = yield* Ref.make(0);

    return {
      ...webSocketClient,
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
 */
export const Client = Context.Service<Effect.Success<ReturnType<typeof make>>>(
  "@confect/foldkit/Client",
);

export type Client = typeof Client.Identifier;

/**
 * Constructs one scoped client for a Foldkit application's `resources`.
 */
export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) =>
  Layer.effect(
    Client,
    Effect.flatMap(WebSocketClient.WebSocketClient, make),
  ).pipe(Layer.provide(WebSocketClient.layer(address, options)));

export { WebSocketClientError } from "@confect/js/WebSocketClient";
