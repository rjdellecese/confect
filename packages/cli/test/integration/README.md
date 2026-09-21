# CLI integration tests

This directory exercises generated projects across module and process boundaries.
The CLI Vitest project discovers `test/integration/**/*.test.ts` alongside the
per-module unit tests in `test/*.test.ts`.

Run `pnpm build` before these tests: generated projects consume the published
package entry points from `dist/`. The schema AOT suite builds temporary projects,
checks their generated TypeScript, and executes their codecs in Node with dynamic
code generation disabled. It does not require a Convex deployment.
