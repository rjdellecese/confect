# @confect/platform

Effect clients for the [Convex Platform APIs](https://docs.convex.dev/platform-apis). Use this package to manage Convex infrastructure. To call your application's queries, mutations, or actions, use `@confect/js` instead.

```sh
pnpm add @confect/platform effect
```

```ts
import { ManagementClient } from "@confect/platform";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

const listProjects = Effect.gen(function* () {
  const token = yield* Config.Redacted("CONVEX_ACCESS_TOKEN");
  const client = ManagementClient.make(token);
  const teamId = yield* Config.Number("CONVEX_TEAM_ID");
  const page = yield* client.listProjects(teamId, { limit: 20 });
  return page.items;
});
```

`ManagementClient` uses an access token for team, project, deployment, and credential operations. `DeploymentClient` takes a deployment name or full URL and a deployment credential. Both expose named operations as Effects, validate success responses, and provide a `layer` for dependency injection. Use `streamProjects` or another cursor stream to consume a listing without writing a pagination loop.

See the [platform client guide](https://confect.dev/clients/platform) for examples of dependency injection, redacted credentials, and handling the specific errors each operation can return.
