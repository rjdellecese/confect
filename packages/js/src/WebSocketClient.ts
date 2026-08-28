import { ConvexClient } from "convex/browser";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as InternalWebSocketClient from "./internal/WebSocketClient";

export { WebSocketClientError } from "./internal/WebSocketClient";

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) =>
  InternalWebSocketClient.makeScoped(
    address,
    Effect.sync(() => {
      const convexClient = new ConvexClient(address, options);
      return {
        setAuth: (fetchToken, onChange) =>
          onChange === undefined
            ? convexClient.setAuth(fetchToken)
            : convexClient.setAuth(fetchToken, onChange),
        close: () => convexClient.close(),
        query: (functionReference, encodedArgs) =>
          convexClient.query(functionReference, encodedArgs),
        mutation: (functionReference, encodedArgs) =>
          convexClient.mutation(functionReference, encodedArgs),
        action: (functionReference, encodedArgs) =>
          convexClient.action(functionReference, encodedArgs),
        onUpdate: (functionReference, encodedArgs, onUpdate, onError) =>
          convexClient.onUpdate(
            functionReference,
            encodedArgs,
            onUpdate,
            onError,
          ),
      };
    }),
  );

/**
 * A Confect client which uses a WebSocket to communicate with your Convex backend and supports reactive query subscriptions. The WebSocket connection is managed by the layer's scope and closed automatically when the scope ends. Wraps [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient).
 */
export const WebSocketClient = Context.Service<
  Effect.Success<ReturnType<typeof make>>
>("@confect/js/WebSocketClient");

export type WebSocketClient = typeof WebSocketClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexClient>[1],
) => Layer.effect(WebSocketClient, make(address, options));
