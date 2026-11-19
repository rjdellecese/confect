import { createDeploymentClient } from "@convex-dev/platform";
import type { paths } from "@convex-dev/platform/deploymentApi";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Client from "./internal/Client.js";

export interface Options {
  readonly fetch?: (request: Request) => Promise<Response>;
}

export class DeploymentClient extends Context.Service<
  DeploymentClient,
  Client.Client<paths>
>()("@confect/platform/DeploymentClient") {}

export const make = (
  nameOrUrl: string,
  token: Redacted.Redacted<string>,
  options?: Options,
): Client.Client<paths> =>
  Client.make(
    createDeploymentClient(nameOrUrl, Redacted.value(token)),
    options?.fetch,
  );

export const layer = (
  nameOrUrl: string,
  token: Redacted.Redacted<string>,
  options?: Options,
) => Layer.sync(DeploymentClient, () => make(nameOrUrl, token, options));
