import util from "node:util";

import { Schema } from "@effect/schema";
import { expect, test } from "vitest";

import { defineEffectSchema, defineEffectTable } from "../src/schema";

test("doesn't hang", () => {
  expect(() =>
    console.log(
      util.inspect(
        defineEffectSchema({
          notes: defineEffectTable(
            Schema.struct({
              content: Schema.string,
            })
          ).index("content", ["content"]),
        }).schemaDefinition,
        { depth: null }
      )
    )
  ).not.toThrow();
});
