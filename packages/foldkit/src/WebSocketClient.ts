import type * as Ref from "@confect/core/Ref";
import {
  layer,
  WebSocketClient,
  WebSocketClientError,
} from "@confect/js/WebSocketClient";
import type * as Schema from "effect/Schema";

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

/**
 * Everything a `WebSocketClient` call against `Ref_` can fail with: the ref's
 * typed error (if it declares an `error` schema), a transport-level
 * `WebSocketClientError`, or a `SchemaError` from encoding args or decoding
 * returns.
 */
export type Error<Ref_ extends Ref.Any> =
  | Ref.Error<Ref_>
  | WebSocketClientError
  | Schema.SchemaError;
