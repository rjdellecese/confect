# @confect/alchemy

Alchemy resources for Convex cloud projects, deployments, deploy keys, environment variables, and code deployments. `Confect.Backend` runs Confect codegen before deploying an existing application.

```ts
import { Confect, Convex } from "@confect/alchemy";
```

Use `Convex.providers()` in your Alchemy stack. The integration targets Alchemy `2.0.0-beta.79` and Effect v4; it does not add Alchemy dependencies to Confect's runtime packages. Plain Convex applications can use `Convex.Code` without the Confect CLI.

See the [deployment guide](https://confect.dev/guides/alchemy) for complete examples, credentials, ownership, and deletion policies.

Projects and deployments are retained by default. Treat your Alchemy state as a secret store: it contains deployment credentials and managed environment values. Code deployment runs on every apply and never deletes data when removed from a stack. All resources are cloud-backed, including in `alchemy dev`.

## Tests

Unit suites are per-module under `test/`. Cross-module lifecycle tests live under `test/integration/` and exercise Alchemy's engine with controlled API/process boundaries; they do not provision cloud resources.

```sh
pnpm exec vitest run --project @confect/alchemy
```
