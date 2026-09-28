import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Code from "./Code";
import * as ConvexClient from "./ConvexClient";
import * as Deployment from "./Deployment";
import * as DeployKey from "./DeployKey";
import * as EnvironmentVariables from "./EnvironmentVariables";
import * as Project from "./Project";
import * as CommandRunner from "./internal/CommandRunner";

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
      Code.Code,
    ]),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        Project.layer,
        Deployment.layer,
        DeployKey.layer,
        EnvironmentVariables.layer,
        Code.layer,
      ),
    ),
    Layer.provide(
      ConvexClient.layer(options).pipe(Layer.provide(FetchHttpClient.layer)),
    ),
    Layer.provide(CommandRunner.layer),
  );
