/// <reference types="vite/client" />

// Imported by relative path rather than as `@confect/test` to keep
// `@confect/test` out of `@confect/server`'s declared dep graph.
// `@confect/test` peer-depends on `@confect/server` (its `TestConfect.run`
// helper consumes server-side `RegisteredConvexFunction.mutationLayer`
// values at runtime), so a reciprocal devDep here would create a cyclic
// workspace-dependency warning from pnpm. Bypassing module resolution at
// the import site is symmetric with how `setup.ts` resolves the
// `@confect/cli` binary by filesystem path for the same reason.
import { TestConfect as TestConfect_ } from "../../../test/src";

import convexSchema from "./fixtures/confect/_generated/convexSchema";
import confectSchema from "./fixtures/confect/_generated/schema";

export const TestConfect = TestConfect_.TestConfect<typeof confectSchema>();

export const layer = TestConfect_.layer(
  confectSchema,
  convexSchema,
  import.meta.glob([
    "./fixtures/convex/**/*.ts",
    "./fixtures/convex/**/*.js",
    "!./fixtures/convex/**/*.*.*",
  ]),
);
