import { createManagementClient } from "@convex-dev/platform";
import type { paths } from "@convex-dev/platform/managementApi";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Client from "./internal/Client.js";

export interface Options {
  readonly baseUrl?: string;
  readonly fetch?: (request: Request) => Promise<Response>;
}

export class ManagementClient extends Context.Service<
  ManagementClient,
  Client.Client<paths>
>()("@confect/platform/ManagementClient") {}

export const make = (
  token: Redacted.Redacted<string>,
  options?: Options,
): Client.Client<paths> => {
  const sdk = token.pipe(Redacted.value, createManagementClient);
  return Client.make(sdk, options?.fetch, options?.baseUrl);
};

export const layer = (token: Redacted.Redacted<string>, options?: Options) =>
  Layer.sync(ManagementClient, () => make(token, options));
