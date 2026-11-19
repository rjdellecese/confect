import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ConvexClient from "./ConvexClient.js";
import { Providers } from "./internal/Resources.js";
import * as Project from "./Project.js";
import * as Deployment from "./Deployment.js";
import * as DeployKey from "./DeployKey.js";
import * as Code from "./Code.js";
import * as EnvironmentVariables from "./EnvironmentVariables.js";
import * as AuthoritativeEnvironmentVariable from "./AuthoritativeEnvironmentVariable.js";
export { Providers };
export const providers = (options?: Parameters<typeof ConvexClient.layer>[0]) =>
  Layer.effect(
    Providers,
    Provider.collection([
      Project.Project,
      Deployment.Deployment,
      DeployKey.DeployKey,
      Code.Code,
      EnvironmentVariables.EnvironmentVariables,
      AuthoritativeEnvironmentVariable.AuthoritativeEnvironmentVariable,
    ]),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        Project.layer,
        Deployment.layer,
        DeployKey.layer,
        Code.layer,
        EnvironmentVariables.layer,
        AuthoritativeEnvironmentVariable.layer,
      ),
    ),
    Layer.provide(
      ConvexClient.ConvexClient.pipe(
        Effect.serviceOption,
        Effect.map(
          Option.match({
            onNone: () => ConvexClient.layer(options),
            onSome: (client) =>
              Layer.succeed(ConvexClient.ConvexClient, client),
          }),
        ),
        Layer.unwrap,
      ),
    ),
  );
