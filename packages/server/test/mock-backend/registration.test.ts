/// <reference types="vite/client" />

/**
 * A generated group module registers every function in its group when it is
 * evaluated, and Convex reads a function's validators only when it exports
 * them. This file has its own module registry, so the group module below is
 * evaluated here for the first time.
 */

import { Ref } from "@confect/core";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import { assert, describe, expect, it } from "@effect/vitest";
import { convexTest } from "convex-test";
import * as Effect from "effect/Effect";
import { vi } from "vitest";
import convexSchema from "./fixtures/confect/_generated/convexSchema";
import refs from "./fixtures/confect/_generated/refs";

vi.mock("@confect/core/SchemaToValidator", (importOriginal) =>
  importOriginal<typeof SchemaToValidator>().then((original) => ({
    ...original,
    compileArgsSchema: vi.fn(original.compileArgsSchema),
    compileReturnsSchema: vi.fn(original.compileReturnsSchema),
  })),
);

// Same module glob as TestConfect.ts.
const modules = import.meta.glob([
  "./fixtures/convex/**/*.ts",
  "./fixtures/convex/**/*.js",
  "!./fixtures/convex/**/*.*.*",
]);

describe("A generated group module", () => {
  it.effect(
    "compiles no validators when it loads, and only those of the function called",
    () =>
      Effect.gen(function* () {
        const compileArgs = vi.mocked(SchemaToValidator.compileArgsSchema);
        const compileReturns = vi.mocked(
          SchemaToValidator.compileReturnsSchema,
        );
        compileArgs.mockClear();
        compileReturns.mockClear();
        const load = modules["./fixtures/convex/groups/notes.ts"];
        assert(load !== undefined);
        const notes = yield* Effect.promise(load);
        expect(Object.keys(notes as object).length).toBeGreaterThan(1);
        expect(compileArgs).not.toHaveBeenCalled();
        expect(compileReturns).not.toHaveBeenCalled();
        const t = convexTest(convexSchema, modules);
        yield* Effect.promise(() =>
          t.mutation(
            Ref.getFunctionReference(refs.public.groups.notes.insert),
            { text: "registered lazily" },
          ),
        );
        expect(compileArgs).toHaveBeenCalledOnce();
        expect(compileReturns).toHaveBeenCalledOnce();
      }),
  );
});
