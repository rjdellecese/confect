# Run WebSocket client integration tests

Use Node 24, as pinned in the root `.node-version`. The shared fixture includes
Node actions, which the local Convex backend cannot deploy under Node 26.
From the repository root, run:

```sh
pnpm build
pnpm test:js:local-backend
```

The suite exercises the public `WebSocketClient.layer` against a real local
Convex backend. It reuses the server suite's `LocalBackend` lifecycle and fixture
project under `packages/server/test/local-backend`. The client-specific endpoints
live in that project's `confect/webSocketClient.ts`; they use raw Convex functions
so the tests can check client codecs independently of the server bindings.

The backend uses ports 3210 and 3211. Run this suite separately from the server
local-backend suite and the example app. The first run may download a Convex
backend binary. The Packages CI workflow runs both local-backend suites in
sequence.

`vitest.local-backend.config.ts` discovers these integration tests. The ordinary
`@confect/js` test project keeps the fast HTTP client tests and WebSocket client
type assertions; it does not start a backend.
