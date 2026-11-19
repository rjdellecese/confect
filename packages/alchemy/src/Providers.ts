import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import * as AuthoritativeEnvironmentVariable from "./AuthoritativeEnvironmentVariable.js";
import * as Code from "./Code.js";
import * as ConvexClient from "./ConvexClient.js";
import * as Deployment from "./Deployment.js";
import * as DeployKey from "./DeployKey.js";
import * as EnvironmentVariables from "./EnvironmentVariables.js";
import * as Project from "./Project.js";
import * as CommandRunner from "./internal/CommandRunner.js";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "@confect/alchemy/Providers",
) {}

/**
 * Register cloud resources without eagerly resolving management credentials.
 */
export const providers = (options?: Parameters<typeof ConvexClient.layer>[0]) =>
  Layer.effect(
    Providers,
    Provider.collection([
      Project.Project,
      Deployment.Deployment,
      DeployKey.DeployKey,
      EnvironmentVariables.EnvironmentVariables,
      AuthoritativeEnvironmentVariable.AuthoritativeEnvironmentVariable,
      Code.Code,
    ]),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        Project.layer,
        Deployment.layer,
        DeployKey.layer,
        EnvironmentVariables.layer,
        AuthoritativeEnvironmentVariable.layer,
        Code.layer,
      ),
    ),
    Layer.provide(ConvexClient.layer(options)),
    Layer.provide(CommandRunner.layer),
  );
