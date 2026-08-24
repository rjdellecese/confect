import {
  layer,
  WebSocketClient,
  WebSocketClientError,
} from "@confect/js/WebSocketClient";

/**
 * The Confect WebSocket client, re-exported from `@confect/js` for use as a
 * Foldkit resource. Pass `layer(address)` to `Runtime.makeApplication`'s
 * `resources` so the client lives for the lifetime of the app and the socket
 * closes at teardown:
 *
 * ```ts
 * Runtime.makeApplication({
 *   // ...
 *   resources: WebSocketClient.layer(import.meta.env.VITE_CONVEX_URL),
 * })
 * ```
 */
export { layer, WebSocketClient, WebSocketClientError };
