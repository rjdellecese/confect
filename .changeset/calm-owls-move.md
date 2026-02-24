---
"@confect/cli": patch
---

Add configurable preservation of files in the Convex directory during `confect codegen` and `confect dev`.

- Introduce `ConfectConfig` service in `packages/cli/src/services/ConfectConfig.ts`.
- Read preserve configuration from `confect/confect.config.ts` (preferred) or `confect/confect.json`.
- Support both single and multiple preserve keys:
  - `preserveConvexFile`
  - `preserveConvexFileName`
  - `preserveConvexFileNames`
- Ensure preserved files are excluded from generated group cleanup/deletion logic.
- Add tests in `packages/cli/test/ConfectConfig.test.ts` verifying:
  - A configured file is not deleted.
  - An unconfigured file is deleted.
