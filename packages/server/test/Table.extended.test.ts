import { describe, it } from "@effect/vitest";
import { assertFalse, assertTrue } from "@effect/vitest/utils";
import { Effect, Schema } from "effect";
import * as Table from "../src/Table";

describe("Table", () => {
  it.effect("isTable returns true for Table values", () =>
    Effect.gen(function* () {
      const table = Table.make("test", Schema.Struct({ x: Schema.String }));
      assertTrue(Table.isTable(table));
    }),
  );

  it.effect("isTable returns false for non-Table values", () =>
    Effect.gen(function* () {
      assertFalse(Table.isTable({}));
      assertFalse(Table.isTable(null));
      assertFalse(Table.isTable("string"));
    }),
  );

  it.effect("searchIndex creates a searchable table definition", () =>
    Effect.gen(function* () {
      const table = Table.make(
        "articles",
        Schema.Struct({ body: Schema.String, category: Schema.String }),
      ).searchIndex("search_body", {
        searchField: "body",
        filterFields: ["category"],
      });

      assertTrue(Table.isTable(table));
    }),
  );

  it.effect("vectorIndex creates a vector-searchable table definition", () =>
    Effect.gen(function* () {
      const table = Table.make(
        "docs",
        Schema.Struct({
          embedding: Schema.Array(Schema.Number),
          category: Schema.String,
        }),
      ).vectorIndex("vec", {
        vectorField: "embedding",
        dimensions: 768,
        filterFields: ["category"],
      });

      assertTrue(Table.isTable(table));
    }),
  );

  it.effect(
    "vectorIndex without filterFields creates a vector-searchable table",
    () =>
      Effect.gen(function* () {
        const table = Table.make(
          "docs",
          Schema.Struct({
            vec: Schema.Array(Schema.Number),
          }),
        ).vectorIndex("vec_idx", {
          vectorField: "vec",
          dimensions: 512,
        });

        assertTrue(Table.isTable(table));
      }),
  );
});
