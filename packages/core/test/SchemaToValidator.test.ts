import {
  compileAst,
  type UndefinedOrValueToValidator,
  type ValueToValidator,
} from "@confect/core/SchemaToValidator";
import type { TypeError } from "@confect/core/Types";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
  v,
  type VAny,
  type VArray,
  type VObject,
  type VOptional,
} from "convex/values";
import type { Brand } from "effect";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

describe("ValueToValidator", () => {
  it("preserves wide literal unions in required, optional, and nested validators", () => {
    type Hex =
      | "0"
      | "1"
      | "2"
      | "3"
      | "4"
      | "5"
      | "6"
      | "7"
      | "8"
      | "9"
      | "a"
      | "b"
      | "c"
      | "d"
      | "e"
      | "f";
    type Wide = `member_${Hex}${Hex}`;
    type Converted = ValueToValidator<{
      code: Wide;
      optional?: Wide;
      nested: { codes: readonly Wide[] };
    }>;
    type Required = Converted["fields"]["code"];
    type Optional = Converted["fields"]["optional"];
    type Element = Converted["fields"]["nested"]["fields"]["codes"]["element"];
    expectTypeOf<Required["members"]["length"]>().toEqualTypeOf<256>();
    expectTypeOf<Required["members"][number]["type"]>().toEqualTypeOf<Wide>();
    expectTypeOf<
      Required["members"][number]["kind"]
    >().toEqualTypeOf<"literal">();
    expectTypeOf<
      Required["members"][number]["isOptional"]
    >().toEqualTypeOf<"required">();
    expectTypeOf<Optional["type"]>().toEqualTypeOf<Wide | undefined>();
    expectTypeOf<Optional["isOptional"]>().toEqualTypeOf<"optional">();
    expectTypeOf<Optional["members"]>().toEqualTypeOf<Required["members"]>();
    expectTypeOf<Element>().toEqualTypeOf<Required>();
    expectTypeOf<Converted["fieldPaths"]>().toEqualTypeOf<
      "code" | "optional" | "nested" | "nested.codes"
    >();
  });

  it("preserves boolean folding and member types in wide mixed unions", () => {
    type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
    type Wide = `member_${Digit}${Digit}`;
    type Converted = ValueToValidator<
      Wide | boolean | 42 | null | { count: number }
    >;
    type Members = Converted["members"][number];
    expectTypeOf<Converted["members"]["length"]>().toEqualTypeOf<68>();
    expectTypeOf<Members["type"]>().toEqualTypeOf<
      Wide | boolean | 42 | null | { count: number }
    >();
    expectTypeOf<
      Extract<Members, { kind: "boolean" }>["type"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<Members["isOptional"]>().toEqualTypeOf<"required">();
    expectTypeOf<Converted["fieldPaths"]>().toEqualTypeOf<"count">();
  });

  it("preserves never element validators", () => {
    expectTypeOf<ValueToValidator<[]>>().toEqualTypeOf<
      VArray<never[], never>
    >();
    expectTypeOf<ValueToValidator<readonly []>>().toEqualTypeOf<
      VArray<never[], never>
    >();
    expectTypeOf<ValueToValidator<never[]>>().toEqualTypeOf<
      VArray<never[], never>
    >();
  });

  it("preserves undefined-only and optional-never fields", () => {
    expectTypeOf<ValueToValidator<{ value: undefined }>>().toEqualTypeOf<
      VObject<{ value: never }, { value: VOptional<VAny> }>
    >();
    expectTypeOf<ValueToValidator<{ value?: never }>>().toEqualTypeOf<
      VObject<{ value?: never }, { value: VOptional<VAny> }>
    >();
  });

  it("distinguishes required and optional any fields", () => {
    const expected = v.object({
      required: v.any(),
      optional: v.optional(v.any()),
    });
    expectTypeOf<
      ValueToValidator<{ required: any; optional?: any }>
    >().toEqualTypeOf<typeof expected>();
  });

  it("constructs required record values independently of object optionality", () => {
    const expected = v.object({
      records: v.array(v.record(v.string(), v.any())),
      optional: v.optional(v.record(v.string(), v.any())),
    });
    expectTypeOf<
      ValueToValidator<{
        readonly records: ReadonlyArray<Record<string, any>>;
        readonly optional?: Record<string, any>;
      }>
    >().toEqualTypeOf<typeof expected>();
  });

  it("keeps collection children required when their containing fields are optional", () => {
    type Converted = ValueToValidator<{
      rows?: ReadonlyArray<Record<string, { label?: string }>>;
      metadata?: Record<string, readonly number[]>;
      choice?:
        | { kind: "text"; text: string }
        | { kind: "number"; value: number };
    }>;
    type Rows = Converted["fields"]["rows"];
    type Metadata = Converted["fields"]["metadata"];
    type Choice = Converted["fields"]["choice"];

    expectTypeOf<Rows["isOptional"]>().toEqualTypeOf<"optional">();
    expectTypeOf<Rows["element"]["isOptional"]>().toEqualTypeOf<"required">();
    expectTypeOf<
      Rows["element"]["value"]["isOptional"]
    >().toEqualTypeOf<"required">();
    expectTypeOf<
      Rows["element"]["value"]["fields"]["label"]["isOptional"]
    >().toEqualTypeOf<"optional">();
    expectTypeOf<Metadata["isOptional"]>().toEqualTypeOf<"optional">();
    expectTypeOf<Metadata["value"]["isOptional"]>().toEqualTypeOf<"required">();
    expectTypeOf<
      Metadata["value"]["element"]["isOptional"]
    >().toEqualTypeOf<"required">();
    expectTypeOf<Choice["isOptional"]>().toEqualTypeOf<"optional">();
    expectTypeOf<
      Choice["members"][number]["isOptional"]
    >().toEqualTypeOf<"required">();
  });

  it("rejects undefined record values without absorbing a never array element", () => {
    expectTypeOf<
      ValueToValidator<Record<string, number | undefined>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      ValueToValidator<ReadonlyArray<Record<string, number | undefined>>>
    >().toEqualTypeOf<VArray<Record<string, number>[], never>>();
  });

  it("keeps optional fields in record values", () => {
    const expected = v.record(
      v.string(),
      v.object({
        labels: v.array(v.literal("label")),
        metadata: v.optional(v.record(v.string(), v.any())),
      }),
    );
    expectTypeOf<
      ValueToValidator<
        Record<
          string,
          {
            readonly labels: readonly "label"[];
            readonly metadata?: Record<string, any>;
          }
        >
      >
    >().toEqualTypeOf<typeof expected>();
  });

  it("preserves the types and field paths of readonly nested values", () => {
    const expected = v.object({
      profile: v.optional(v.object({ name: v.string(), active: v.boolean() })),
      rows: v.array(v.object({ count: v.float64() })),
    });
    type Input = {
      readonly profile?: { readonly name: string; readonly active: boolean };
      readonly rows: ReadonlyArray<{ readonly count: number }>;
    };
    expectTypeOf<ValueToValidator<Input>>().toEqualTypeOf<typeof expected>();
    expectTypeOf<ValueToValidator<Input>["fieldPaths"]>().toEqualTypeOf<
      "profile" | "profile.name" | "profile.active" | "rows"
    >();
  });

  it("does not treat shared subtrees as cycles", () => {
    type Child = { label: string };
    const expected = v.object({
      left: v.object({ label: v.string() }),
      right: v.object({ label: v.string() }),
    });
    expectTypeOf<
      ValueToValidator<{ left: Child; right: Child }>
    >().toEqualTypeOf<typeof expected>();
  });

  it("collapses a nested cycle but not a legitimate any field", () => {
    type Recursive = { next: Recursive };
    expectTypeOf<
      ValueToValidator<{ value: any; nested: Recursive }>
    >().toEqualTypeOf<VAny>();
  });

  it("preserves recursion detection before invalid-value rejection", () => {
    type RecursiveTuple = [string, RecursiveTuple?];
    type RecursiveMap = Map<string, RecursiveMap>;
    type RecursiveSet = Set<RecursiveSet>;
    type InvalidRecursive = { invalid: Date; next: InvalidRecursive };
    expectTypeOf<ValueToValidator<RecursiveTuple>>().toEqualTypeOf<VAny>();
    expectTypeOf<ValueToValidator<RecursiveMap>>().toEqualTypeOf<VAny>();
    expectTypeOf<ValueToValidator<RecursiveSet>>().toEqualTypeOf<VAny>();
    expectTypeOf<ValueToValidator<InvalidRecursive>>().toEqualTypeOf<VAny>();
    expectTypeOf<
      ValueToValidator<Date | InvalidRecursive>
    >().toEqualTypeOf<VAny>();
  });

  it("preserves branded recursion boundaries", () => {
    type Recursive = { next: Recursive };
    type Branded = { child: Recursive } & Brand.Brand<"parent">;
    expectTypeOf<ValueToValidator<Branded>>().toEqualTypeOf<
      TypeError<"Provided value is not a valid Convex value", Branded>
    >();
    type BrandedArray = Recursive[] & Brand.Brand<"array">;
    expectTypeOf<
      ValueToValidator<BrandedArray>["kind"]
    >().toEqualTypeOf<"array">();
    expectTypeOf<
      ValueToValidator<BrandedArray>["element"]
    >().toEqualTypeOf<VAny>();
  });

  it("detects recursion through augmented primitives and readonly arrays", () => {
    type Recursive = { next: Recursive };
    expectTypeOf<
      ValueToValidator<{ value: string & { child: Recursive } }>
    >().toEqualTypeOf<VAny>();
    expectTypeOf<
      ValueToValidator<readonly string[] & { child: Recursive }>
    >().toEqualTypeOf<VAny>();
  });

  it("preserves invalid symbol-keyed fields as never", () => {
    const metadata = Symbol();
    type Input = { name: string; [metadata]: () => string };
    expectTypeOf<
      ValueToValidator<Input>["fields"][typeof metadata]
    >().toEqualTypeOf<never>();
  });

  it("preserves tagged errors for non-recursive invalid values", () => {
    expectTypeOf<ValueToValidator<unknown>>().toEqualTypeOf<
      TypeError<"Provided value is not a valid Convex value", unknown>
    >();
    expectTypeOf<ValueToValidator<Date | string>>().toEqualTypeOf<
      TypeError<"Provided value is not a valid Convex value", Date | string>
    >();
  });
});

describe("UndefinedOrValueToValidator", () => {
  it("preserves any, never, undefined, and recursive values", () => {
    type Recursive = { child: Recursive };
    expectTypeOf<UndefinedOrValueToValidator<any>>().toEqualTypeOf<
      VOptional<VAny>
    >();
    expectTypeOf<UndefinedOrValueToValidator<never>>().toEqualTypeOf<never>();
    expectTypeOf<UndefinedOrValueToValidator<undefined>>().toEqualTypeOf<
      VOptional<VAny>
    >();
    expectTypeOf<
      UndefinedOrValueToValidator<Recursive | undefined>
    >().toEqualTypeOf<VOptional<VAny>>();
  });

  it("matches native optional wrapping for arrays, objects, records, and unions", () => {
    type ArrayValue = readonly string[];
    type ObjectValue = { readonly name: string };
    type RecordValue = Record<string, any>;
    type UnionValue = string | number | null;
    expectTypeOf<
      UndefinedOrValueToValidator<ArrayValue | undefined>
    >().toEqualTypeOf<VOptional<ValueToValidator<ArrayValue>>>();
    expectTypeOf<
      UndefinedOrValueToValidator<ObjectValue | undefined>
    >().toEqualTypeOf<VOptional<ValueToValidator<ObjectValue>>>();
    expectTypeOf<
      UndefinedOrValueToValidator<RecordValue | undefined>
    >().toEqualTypeOf<VOptional<ValueToValidator<RecordValue>>>();
    expectTypeOf<
      UndefinedOrValueToValidator<UnionValue | undefined>
    >().toEqualTypeOf<VOptional<ValueToValidator<UnionValue>>>();
  });
});

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
