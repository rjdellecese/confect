import { compileAst } from "@confect/core/SchemaToValidator";
import { describe, expect, it } from "@effect/vitest";
import { v } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

describe("compiler preprocessing", () => {
  it.effect("captures union members before executing the compiler effect", () =>
    Effect.gen(function* () {
      const ast = Schema.Union([Schema.String, Schema.Boolean]).ast;
      const effect = compileAst(ast);
      Object.defineProperty(ast, "types", { value: [Schema.Null.ast] });

      expect(yield* effect).toEqual(v.union(v.string(), v.boolean()));
      expect(yield* effect).toEqual(v.union(v.string(), v.boolean()));
      expect(yield* compileAst(ast)).toEqual(v.null());
    }),
  );

  it.effect(
    "captures tuple elements before executing the compiler effect",
    () =>
      Effect.gen(function* () {
        const ast = Schema.Tuple([Schema.String]).ast;
        const effect = compileAst(ast);
        Object.defineProperty(ast, "elements", { value: [Schema.Boolean.ast] });

        expect(yield* effect).toEqual(v.array(v.string()));
        expect(yield* effect).toEqual(v.array(v.string()));
        expect(yield* compileAst(ast)).toEqual(v.array(v.boolean()));
      }),
  );

  it.effect(
    "captures array rest elements before executing the compiler effect",
    () =>
      Effect.gen(function* () {
        const ast = Schema.Array(Schema.String).ast;
        const effect = compileAst(ast);
        Object.defineProperty(ast, "rest", { value: [Schema.Boolean.ast] });

        expect(yield* effect).toEqual(v.array(v.string()));
        expect(yield* effect).toEqual(v.array(v.string()));
        expect(yield* compileAst(ast)).toEqual(v.array(v.boolean()));
      }),
  );
});
