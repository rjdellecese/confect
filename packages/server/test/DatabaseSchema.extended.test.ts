import { describe, it } from "@effect/vitest";
import { assertFalse, assertTrue } from "@effect/vitest/utils";
import { Effect } from "effect";
import * as DatabaseSchema from "../src/DatabaseSchema";

describe("DatabaseSchema", () => {
  it.effect("isSchema returns true for DatabaseSchema values", () =>
    Effect.gen(function* () {
      const schema = DatabaseSchema.make();
      assertTrue(DatabaseSchema.isSchema(schema));
    }),
  );

  it.effect("isSchema returns false for non-DatabaseSchema values", () =>
    Effect.gen(function* () {
      assertFalse(DatabaseSchema.isSchema({}));
      assertFalse(DatabaseSchema.isSchema(null));
      assertFalse(DatabaseSchema.isSchema("not a schema"));
    }),
  );
});
