// @effect-diagnostics schemaNumber:off
import { bench } from "confect-bench-harness";
import type { GenericId } from "@confect/core/GenericId";
import * as Schema from "effect/Schema";
import type {
  TableSchemaToTableValidator,
  ValueToValidator,
} from "@confect/core/SchemaToValidator";

// Force module-level instantiations so they are excluded from individual benchmarks.
void ({} as ValueToValidator<any>);

// --- Primitives and scalars ---

bench("ValueToValidator<string>", () => ({}) as ValueToValidator<string>).types(
  [99, "instantiations"],
);

bench("ValueToValidator<number>", () => ({}) as ValueToValidator<number>).types(
  [76, "instantiations"],
);

bench("ValueToValidator<bigint>", () => ({}) as ValueToValidator<bigint>).types(
  [81, "instantiations"],
);

bench("ValueToValidator<boolean>", () =>
  ({}) as ValueToValidator<boolean>).types([60, "instantiations"]);

bench("ValueToValidator<null>", () => ({}) as ValueToValidator<null>).types([
  49,
  "instantiations",
]);

bench("ValueToValidator<ArrayBuffer>", () =>
  ({}) as ValueToValidator<ArrayBuffer>).types([85, "instantiations"]);

bench("ValueToValidator<any>", () => ({}) as ValueToValidator<any>).types([
  0,
  "instantiations",
]);

bench("ValueToValidator<never>", () => ({}) as ValueToValidator<never>).types([
  3,
  "instantiations",
]);

// --- Literals ---

bench('ValueToValidator<"foo">', () => ({}) as ValueToValidator<"foo">).types([
  101,
  "instantiations",
]);

bench("ValueToValidator<1>", () => ({}) as ValueToValidator<1>).types([
  78,
  "instantiations",
]);

bench("ValueToValidator<true>", () => ({}) as ValueToValidator<true>).types([
  62,
  "instantiations",
]);

bench("ValueToValidator<1n>", () => ({}) as ValueToValidator<1n>).types([
  83,
  "instantiations",
]);

// --- GenericId ---

bench('ValueToValidator<GenericId<"users">>', () =>
  ({}) as ValueToValidator<GenericId<"users">>).types([111, "instantiations"]);

// --- Arrays ---

bench("ValueToValidator<string[]>", () =>
  ({}) as ValueToValidator<string[]>).types([290, "instantiations"]);

bench("ValueToValidator<string[][]>", () =>
  ({}) as ValueToValidator<string[][]>).types([339, "instantiations"]);

bench("ValueToValidator<any[]>", () => ({}) as ValueToValidator<any[]>).types([
  247,
  "instantiations",
]);

// --- Objects (small/medium/large) ---

bench("small object", () => ({}) as ValueToValidator<{ foo: string }>).types([
  753,
  "instantiations",
]);

bench("medium object", () =>
  ({}) as ValueToValidator<{
    foo: string;
    bar: number;
    baz: boolean;
    items: string[];
  }>).types([1211, "instantiations"]);

bench("large object", () =>
  ({}) as ValueToValidator<{
    a: string;
    b: number;
    c: boolean;
    d: bigint;
    e: ArrayBuffer;
    f: null;
    g: string[];
    h: { nested: number };
    i?: string | undefined;
    j: "admin" | "user";
  }>).types([2919, "instantiations"]);

// --- Optional fields ---

bench("ValueToValidator<{ foo?: string | undefined }>", () =>
  ({}) as ValueToValidator<{ foo?: string | undefined }>).types([
  792,
  "instantiations",
]);

bench("ValueToValidator<{ foo?: { bar?: number | undefined } | undefined }>", () =>
  ({}) as ValueToValidator<{
    foo?: { bar?: number | undefined } | undefined;
  }>).types([1103, "instantiations"]);

// --- Unions ---

bench("ValueToValidator<string | number>", () =>
  ({}) as ValueToValidator<string | number>).types([937, "instantiations"]);

bench('ValueToValidator<"admin" | "user">', () =>
  ({}) as ValueToValidator<"admin" | "user">).types([944, "instantiations"]);

bench("ValueToValidator<string | number | boolean[]>", () =>
  ({}) as ValueToValidator<string | number | boolean[]>).types([
  1369,
  "instantiations",
]);

bench("ValueToValidator<{ foo: string } | { bar: number }>", () =>
  ({}) as ValueToValidator<{ foo: string } | { bar: number }>).types([
  1921,
  "instantiations",
]);

bench("ValueToValidator (64-member literal field)", () => {
  type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
  type Converted = ValueToValidator<{ code: `member_${Digit}${Digit}` }>;
  return {} as [
    Converted["fields"]["code"]["members"]["length"],
    Converted["type"],
    Converted["fieldPaths"],
  ];
}).types([60771, "instantiations"]);

bench("ValueToValidator (256-member optional literal field)", () => {
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
  type Converted = ValueToValidator<{ code?: `member_${Hex}${Hex}` }>;
  return {} as [
    Converted["fields"]["code"]["members"]["length"],
    Converted["type"],
    Converted["fieldPaths"],
  ];
}).types([780620, "instantiations"]);

// --- Recursive types ---

type RecursiveObj = { foo: RecursiveObj };

bench("ValueToValidator<RecursiveObj> (recursive object)", () =>
  ({}) as ValueToValidator<RecursiveObj>).types([265, "instantiations"]);

type RecursiveArr = RecursiveArr[];

bench("ValueToValidator<RecursiveArr> (recursive array)", () =>
  ({}) as ValueToValidator<RecursiveArr>).types([233, "instantiations"]);

// --- TableSchemaToTableValidator ---

const SmallTableSchema = Schema.Struct({
  foo: Schema.String,
  bar: Schema.optional(Schema.Number),
});

type SmallTableSchema = typeof SmallTableSchema;

bench("TableSchemaToTableValidator (small struct)", () =>
  ({}) as TableSchemaToTableValidator<SmallTableSchema>).types([
  10124,
  "instantiations",
]);

const MediumTableSchema = Schema.Struct({
  text: Schema.String,
  count: Schema.Number,
  active: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  metadata: Schema.optional(
    Schema.Struct({
      key: Schema.String,
      value: Schema.Number,
    }),
  ),
});

type MediumTableSchema = typeof MediumTableSchema;

bench("TableSchemaToTableValidator (medium struct with optional)", () =>
  ({}) as TableSchemaToTableValidator<MediumTableSchema>).types([
  11392,
  "instantiations",
]);

const LargeTableSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  active: Schema.Boolean,
  score: Schema.BigInt,
  avatar: Schema.instanceOf(ArrayBuffer),
  deletedAt: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  address: Schema.Struct({
    street: Schema.String,
    city: Schema.String,
    zip: Schema.Number,
  }),
  notes: Schema.optional(Schema.String),
  role: Schema.Union([Schema.Literal("admin"), Schema.Literal("user")]),
});

type LargeTableSchema = typeof LargeTableSchema;

bench("TableSchemaToTableValidator (large struct)", () =>
  ({}) as TableSchemaToTableValidator<LargeTableSchema>).types([
  13474,
  "instantiations",
]);

bench("ValueToValidator<Record<string, any>>", () =>
  ({}) as ValueToValidator<Record<string, any>>).types([629, "instantiations"]);

bench("ValueToValidator (optional record)", () =>
  ({}) as ValueToValidator<{ metadata?: Record<string, any> }>).types([
  1234,
  "instantiations",
]);

bench("ValueToValidator (readonly nested output)", () => {
  type Vd = ValueToValidator<{
    readonly profile?: {
      readonly name: string;
      readonly preferences?: { readonly active: boolean };
    };
    readonly rows: ReadonlyArray<{ readonly count: number }>;
  }>;
  return {} as [Vd["type"], Vd["fieldPaths"]];
}).types([2276, "instantiations"]);

bench("ValueToValidator (shared subtree output)", () => {
  type Child = { readonly label: string; readonly items: readonly string[] };
  type Vd = ValueToValidator<{
    readonly left: Child;
    readonly right: Child;
    readonly nested: { readonly child: Child };
  }>;
  return {} as [Vd["type"], Vd["fieldPaths"]];
}).types([2143, "instantiations"]);
