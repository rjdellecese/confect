// @effect-diagnostics schemaNumber:off
import { bench } from "confect-bench-harness";
import type { GenericId } from "@confect/core/GenericId";
import * as Schema from "effect/Schema";
import type {
  TableSchemaToTableValidator,
  ValueToValidator,
} from "@confect/core/SchemaToValidator";

// Force module-level instantiations so they are excluded from individual benchmarks.
// SAFETY: This expression only forces compiler instantiation; void immediately discards the placeholder without reading it as a validator.
void ({} as ValueToValidator<any>);

// --- Primitives and scalars ---

bench("ValueToValidator<string>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<string>;
}).types([51, "instantiations"]);

bench("ValueToValidator<number>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<number>;
}).types([37, "instantiations"]);

bench("ValueToValidator<bigint>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<bigint>;
}).types([42, "instantiations"]);

bench("ValueToValidator<boolean>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<boolean>;
}).types([21, "instantiations"]);

bench("ValueToValidator<null>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<null>;
}).types([13, "instantiations"]);

bench("ValueToValidator<ArrayBuffer>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<ArrayBuffer>;
}).types([49, "instantiations"]);

bench("ValueToValidator<any>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<any>;
}).types([0, "instantiations"]);

bench("ValueToValidator<never>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<never>;
}).types([3, "instantiations"]);

// --- Literals ---

bench('ValueToValidator<"foo">', () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<"foo">;
}).types([59, "instantiations"]);

bench("ValueToValidator<1>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<1>;
}).types([45, "instantiations"]);

bench("ValueToValidator<true>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<true>;
}).types([29, "instantiations"]);

bench("ValueToValidator<1n>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<1n>;
}).types([50, "instantiations"]);

// --- GenericId ---

bench('ValueToValidator<GenericId<"users">>', () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<GenericId<"users">>;
}).types([65, "instantiations"]);

// --- Arrays ---

bench("ValueToValidator<string[]>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<string[]>;
}).types([3340, "instantiations"]);

bench("ValueToValidator<string[][]>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<string[][]>;
}).types([3893, "instantiations"]);

bench("ValueToValidator<any[]>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<any[]>;
}).types([3302, "instantiations"]);

// --- Objects (small/medium/large) ---

bench("small object", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<{ foo: string }>;
}).types([670, "instantiations"]);

bench("medium object", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<{
    foo: string;
    bar: number;
    baz: boolean;
    items: string[];
  }>;
}).types([4148, "instantiations"]);

bench("large object", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
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
}).types([6196, "instantiations"]);

// --- Optional fields ---

bench("ValueToValidator<{ foo?: string | undefined }>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<{ foo?: string | undefined }>;
}).types([920, "instantiations"]);

bench("ValueToValidator<{ foo?: { bar?: number | undefined } | undefined }>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<{
    foo?: { bar?: number | undefined } | undefined;
  }>;
}).types([9260, "instantiations"]);

// --- Unions ---

bench("ValueToValidator<string | number>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<string | number>;
}).types([1307, "instantiations"]);

bench('ValueToValidator<"admin" | "user">', () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<"admin" | "user">;
}).types([1312, "instantiations"]);

bench("ValueToValidator<string | number | boolean[]>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<string | number | boolean[]>;
}).types([4756, "instantiations"]);

bench("ValueToValidator<{ foo: string } | { bar: number }>", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<{ foo: string } | { bar: number }>;
}).types([9854, "instantiations"]);

// --- Recursive types ---

type RecursiveObj = { foo: RecursiveObj };

bench("ValueToValidator<RecursiveObj> (recursive object)", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<RecursiveObj>;
}).types([174, "instantiations"]);

type RecursiveArr = RecursiveArr[];

bench("ValueToValidator<RecursiveArr> (recursive array)", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as ValueToValidator<RecursiveArr>;
}).types([142, "instantiations"]);

// --- TableSchemaToTableValidator ---

const SmallTableSchema = Schema.Struct({
  foo: Schema.String,
  bar: Schema.optional(Schema.Number),
});

type SmallTableSchema = typeof SmallTableSchema;

bench("TableSchemaToTableValidator (small struct)", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as TableSchemaToTableValidator<SmallTableSchema>;
}).types([10366, "instantiations"]);

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
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as TableSchemaToTableValidator<MediumTableSchema>;
}).types([14438, "instantiations"]);

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

bench("TableSchemaToTableValidator (large struct)", () => {
  // SAFETY: .types() measures compiler instantiations without executing this callback, so this placeholder is never used as a validator.
  return {} as TableSchemaToTableValidator<LargeTableSchema>;
}).types([16406, "instantiations"]);
