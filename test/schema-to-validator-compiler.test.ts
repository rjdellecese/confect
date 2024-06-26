import { Schema } from "@effect/schema";
import { v } from "convex/values";
import { describe, expect, test } from "vitest";

import * as schemaToValidatorCompiler from "~/src/schema-to-validator-compiler";

describe("compile", () => {
  test.each([
    {
      name: "literal",
      schema: Schema.Literal("LiteralString"),
      validator: v.literal("LiteralString"),
    },
    {
      name: "boolean",
      schema: Schema.Boolean,
      validator: v.boolean(),
    },
    {
      name: "string",
      schema: Schema.String,
      validator: v.string(),
    },
    {
      name: "number",
      schema: Schema.Number,
      validator: v.float64(),
    },
    {
      name: "empty object",
      schema: Schema.Struct({}),
      validator: v.object({}),
    },
    {
      name: "simple object",
      schema: Schema.Struct({ foo: Schema.String, bar: Schema.Number }),
      validator: v.object({ foo: v.string(), bar: v.float64() }),
    },
    {
      name: "object with optional field",
      schema: Schema.Struct({
        foo: Schema.optional(Schema.String, { exact: true }),
      }),
      validator: v.object({ foo: v.optional(v.string()) }),
    },
    {
      name: "nested objects",
      schema: Schema.Struct({
        foo: Schema.Struct({
          bar: Schema.Struct({
            baz: Schema.String,
          }),
        }),
      }),
      validator: v.object({
        foo: v.object({ bar: v.object({ baz: v.string() }) }),
      }),
    },
    {
      name: "union with four elements",
      schema: Schema.Union(
        Schema.String,
        Schema.Number,
        Schema.Boolean,
        Schema.Struct({})
      ),
      validator: v.union(v.string(), v.float64(), v.boolean(), v.object({})),
    },
    {
      name: "tuple with one element",
      schema: Schema.Tuple(Schema.String),
      validator: v.array(v.string()),
    },
    {
      name: "tuple with two elements",
      schema: Schema.Tuple(Schema.String, Schema.Number),
      validator: v.array(v.union(v.string(), v.float64())),
    },
    {
      name: "tuple with three elements",
      schema: Schema.Tuple(Schema.String, Schema.Number, Schema.Boolean),
      validator: v.array(v.union(v.string(), v.float64(), v.boolean())),
    },
  ])("$name", ({ schema, validator }) => {
    const compiledValidator = schemaToValidatorCompiler.compile(
      Schema.encodedSchema(schema as Schema.Schema<any, any, any>).ast
    );

    expect(compiledValidator).toStrictEqual(validator);
  });
});
