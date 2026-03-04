import { bench } from "@ark/attest";
import type { GenericId } from "@confect/core/GenericId";
import { Schema } from "effect";
import type {
  TableSchemaToTableValidator,
  ValueToValidator,
} from "../src/SchemaToValidator";

// Force module-level instantiations so they are excluded from individual benchmarks.
void ({} as ValueToValidator<any>);

// --- Primitives and scalars ---

bench("ValueToValidator<string>", () => {
  return {} as ValueToValidator<string>;
}).types([51, "instantiations"]);

bench("ValueToValidator<number>", () => {
  return {} as ValueToValidator<number>;
}).types([37, "instantiations"]);

bench("ValueToValidator<bigint>", () => {
  return {} as ValueToValidator<bigint>;
}).types([42, "instantiations"]);

bench("ValueToValidator<boolean>", () => {
  return {} as ValueToValidator<boolean>;
}).types([21, "instantiations"]);

bench("ValueToValidator<null>", () => {
  return {} as ValueToValidator<null>;
}).types([13, "instantiations"]);

bench("ValueToValidator<ArrayBuffer>", () => {
  return {} as ValueToValidator<ArrayBuffer>;
}).types([49, "instantiations"]);

bench("ValueToValidator<any>", () => {
  return {} as ValueToValidator<any>;
}).types([0, "instantiations"]);

bench("ValueToValidator<never>", () => {
  return {} as ValueToValidator<never>;
}).types([3, "instantiations"]);

// --- Literals ---

bench('ValueToValidator<"foo">', () => {
  return {} as ValueToValidator<"foo">;
}).types([59, "instantiations"]);

bench("ValueToValidator<1>", () => {
  return {} as ValueToValidator<1>;
}).types([45, "instantiations"]);

bench("ValueToValidator<true>", () => {
  return {} as ValueToValidator<true>;
}).types([29, "instantiations"]);

bench("ValueToValidator<1n>", () => {
  return {} as ValueToValidator<1n>;
}).types([50, "instantiations"]);

// --- GenericId ---

bench('ValueToValidator<GenericId<"users">>', () => {
  return {} as ValueToValidator<GenericId<"users">>;
}).types([67, "instantiations"]);

// --- Arrays ---

bench("ValueToValidator<string[]>", () => {
  return {} as ValueToValidator<string[]>;
}).types([3138, "instantiations"]);

bench("ValueToValidator<string[][]>", () => {
  return {} as ValueToValidator<string[][]>;
}).types([3685, "instantiations"]);

bench("ValueToValidator<any[]>", () => {
  return {} as ValueToValidator<any[]>;
}).types([3102, "instantiations"]);

// --- Objects (small / medium / large) ---

bench("small object", () => {
  return {} as ValueToValidator<{ foo: string }>;
}).types([734, "instantiations"]);

bench("medium object", () => {
  return {} as ValueToValidator<{
    foo: string;
    bar: number;
    baz: boolean;
    items: string[];
  }>;
}).types([4195, "instantiations"]);

bench("large object", () => {
  return {} as ValueToValidator<{
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
  }>;
}).types([7154, "instantiations"]);

// --- Optional fields ---

bench("ValueToValidator<{ foo?: string | undefined }>", () => {
  return {} as ValueToValidator<{ foo?: string | undefined }>;
}).types([999, "instantiations"]);

bench(
  "ValueToValidator<{ foo?: { bar?: number | undefined } | undefined }>",
  () => {
    return {} as ValueToValidator<{
      foo?: { bar?: number | undefined } | undefined;
    }>;
  },
).types([9370, "instantiations"]);

// --- Unions ---

bench("ValueToValidator<string | number>", () => {
  return {} as ValueToValidator<string | number>;
}).types([1290, "instantiations"]);

bench('ValueToValidator<"admin" | "user">', () => {
  return {} as ValueToValidator<"admin" | "user">;
}).types([1288, "instantiations"]);

bench("ValueToValidator<string | number | boolean[]>", () => {
  return {} as ValueToValidator<string | number | boolean[]>;
}).types([4546, "instantiations"]);

bench("ValueToValidator<{ foo: string } | { bar: number }>", () => {
  return {} as ValueToValidator<{ foo: string } | { bar: number }>;
}).types([9892, "instantiations"]);

// --- Recursive types ---

type RecursiveObj = { foo: RecursiveObj };

bench("ValueToValidator<RecursiveObj> (recursive object)", () => {
  return {} as ValueToValidator<RecursiveObj>;
}).types([168, "instantiations"]);

type RecursiveArr = RecursiveArr[];

bench("ValueToValidator<RecursiveArr> (recursive array)", () => {
  return {} as ValueToValidator<RecursiveArr>;
}).types([137, "instantiations"]);

// --- TableSchemaToTableValidator ---

const SmallTableSchema = Schema.Struct({
  foo: Schema.String,
  bar: Schema.optional(Schema.Number),
});

type SmallTableSchema = typeof SmallTableSchema;

bench("TableSchemaToTableValidator (small struct)", () => {
  return {} as TableSchemaToTableValidator<SmallTableSchema>;
}).types([9422, "instantiations"]);

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

bench("TableSchemaToTableValidator (medium struct with optional)", () => {
  return {} as TableSchemaToTableValidator<MediumTableSchema>;
}).types([14174, "instantiations"]);

const LargeTableSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  active: Schema.Boolean,
  score: Schema.BigIntFromSelf,
  avatar: Schema.instanceOf(ArrayBuffer),
  deletedAt: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  address: Schema.Struct({
    street: Schema.String,
    city: Schema.String,
    zip: Schema.Number,
  }),
  notes: Schema.optional(Schema.String),
  role: Schema.Union(Schema.Literal("admin"), Schema.Literal("user")),
});

type LargeTableSchema = typeof LargeTableSchema;

bench("TableSchemaToTableValidator (large struct)", () => {
  return {} as TableSchemaToTableValidator<LargeTableSchema>;
}).types([17057, "instantiations"]);
