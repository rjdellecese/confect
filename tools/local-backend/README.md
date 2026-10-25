# Local Convex backend test support

`confect-local-backend` is a private workspace package shared by the JavaScript
client and server integration suites. It owns backend startup and shutdown,
readiness checks, fixture codegen, and Vitest configuration. The tests stay in
`packages/<package>/test/local-backend/`.

Use Node 24, as pinned in the root `.node-version`. The fixture includes Node
actions that the local backend cannot deploy under Node 26.

From the repository root:

```sh
pnpm build
pnpm test:js:local-backend
pnpm test:server:local-backend
```

Run these suites sequentially: they use the same fixture deployment and ports
3210 and 3211. Stop the example backend before running them. The first run may
download a Convex backend binary. Each suite manages its own backend lifetime;
sharing this package does not share a running process between test invocations.

## Use the harness

Add `confect-local-backend` as a workspace devDependency. A package's
`vitest.local-backend.config.ts` supplies its root, name, and the workspace's
base configuration:

```ts
import { defineLocalBackendConfig } from "confect-local-backend/vitest";
import sharedConfig from "../../vitest.shared";

export default defineLocalBackendConfig({
  base: sharedConfig,
  root: import.meta.dirname,
  name: "@confect/js",
});
```

Tests import the scoped backend from `confect-local-backend/LocalBackend` and,
when needed, generated function refs from `confect-local-backend/refs`.
The backend layer provides a Convex HTTP client for accessing the deployment.
The client suite uses its URL to construct the public WebSocket client layer.

## Maintain the fixtures

The shared Convex application lives in `fixtures/`. Its own private workspace
package declares the CLI and backend dependencies. Keeping those dependencies
separate from the harness avoids a workspace cycle through `@confect/server`.

The authored counter and parent components live under `fixtures/components/`.
Both global setup and the codegen command generate these components before
the host application. Component tests use `confect-local-backend/api` for
native calls and `confect-local-backend/componentBindings` for scoped types.

After changing fixture functions, regenerate the checked-in outputs:

```sh
pnpm codegen:local-backend
```

Test global setup runs Confect codegen automatically. The explicit codegen
command also regenerates Convex's API declarations. CI checks both the shared
fixture output and the server's separate mock-backend fixture output.

`setupForFixture` is also exported for the server's mock-backend setup. It runs
the repository CLI shim, which requires a prior build, without giving the
harness a dependency on the CLI package.
