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
  const page = yield* client.request("get", "/teams/{team_id}/projects", {
    params: { path: { team_id: yield* Config.Number("CONVEX_TEAM_ID") } },
  });
  return page.items;
});
```

`ManagementClient` uses an access token for the management API. `DeploymentClient` takes a deployment name or full URL and a deployment credential. Both wrap the upstream SDK's typed routes and return Effects; both expose a `layer` for dependency injection. See the [platform client guide](https://confect.dev/clients/platform) for deployment requests, pagination, and errors.
