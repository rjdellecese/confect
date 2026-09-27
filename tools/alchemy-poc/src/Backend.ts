import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Deployment from "./Deployment";

export interface Backend extends Resource<
  "Confect.Poc.Backend",
  Deployment.Props,
  { readonly url: string }
> {}

export const Backend = Resource<Backend>("Confect.Poc.Backend");

export const lifecycle = {
  diff: () => Effect.succeed({ action: "update" as const }),
  reconcile: ({ news }: { readonly news: Deployment.Props }) =>
    Deployment.deploy(news),
  delete: () => Effect.void,
  list: () => Effect.succeed([]),
};

export const providers = Provider.succeed(Backend, lifecycle);
