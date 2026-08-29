import { ConvexHttpClient } from "convex/browser";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as InternalHttpClient from "./internal/HttpClient";

export { HttpClientError } from "./internal/HttpClient";

const make = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => {
  const client = new ConvexHttpClient(address, options);
  return InternalHttpClient.make({
    url: client.url,
    setAuth: (token) => client.setAuth(token),
    clearAuth: () => client.clearAuth(),
    query: (functionReference, encodedArgs) =>
      client.query(functionReference, encodedArgs),
    mutation: (functionReference, encodedArgs) =>
      client.mutation(functionReference, encodedArgs),
    action: (functionReference, encodedArgs) =>
      client.action(functionReference, encodedArgs),
  });
};

/**
 * A Confect client which uses HTTP to communicate with your Convex backend. Works in any JS runtime that supports `fetch`. Wraps [ConvexHttpClient](https://docs.convex.dev/api/classes/browser.ConvexHttpClient).
 */
export const HttpClient = Context.Service<ReturnType<typeof make>>(
  "@confect/js/HttpClient",
);

export type HttpClient = typeof HttpClient.Identifier;

export const layer = (
  address: string,
  options?: ConstructorParameters<typeof ConvexHttpClient>[1],
) => Layer.sync(HttpClient, () => make(address, options));
