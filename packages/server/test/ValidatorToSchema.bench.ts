import { bench } from "@ark/attest";
import { v } from "convex/values";
import type { ValidatorToValue } from "../src/ValidatorToSchema";

// Force module-level instantiations so they are excluded from individual benchmarks.
void ({} as ValidatorToValue<ReturnType<typeof v.any>>);

// --- Primitives and scalars ---

bench("ValidatorToValue<typeof v.string()>", () => {
  return {} as ValidatorToValue<ReturnType<typeof v.string>>;
}).types([139, "instantiations"]);

bench("ValidatorToValue<typeof v.float64()>", () => {
  return {} as ValidatorToValue<ReturnType<typeof v.float64>>;
}).types([140, "instantiations"]);

bench("ValidatorToValue<typeof v.int64()>", () => {
  return {} as ValidatorToValue<ReturnType<typeof v.int64>>;
}).types([140, "instantiations"]);

bench("ValidatorToValue<typeof v.boolean()>", () => {
  return {} as ValidatorToValue<ReturnType<typeof v.boolean>>;
}).types([147, "instantiations"]);

bench("ValidatorToValue<typeof v.null()>", () => {
  return null as ValidatorToValue<ReturnType<typeof v.null>>;
}).types([140, "instantiations"]);

bench("ValidatorToValue<typeof v.bytes()>", () => {
  return {} as ValidatorToValue<ReturnType<typeof v.bytes>>;
}).types([140, "instantiations"]);

bench("ValidatorToValue<typeof v.any()>", () => {
  return {} as ValidatorToValue<ReturnType<typeof v.any>>;
}).types([4, "instantiations"]);

// --- Literals ---

bench('ValidatorToValue<typeof v.literal("foo")>', () => {
  const _v = v.literal("foo");
  return {} as ValidatorToValue<typeof _v>;
}).types([138, "instantiations"]);

bench("ValidatorToValue<typeof v.literal(1)>", () => {
  const _v = v.literal(1);
  return {} as ValidatorToValue<typeof _v>;
}).types([138, "instantiations"]);

bench("ValidatorToValue<typeof v.literal(true)>", () => {
  const _v = v.literal(true);
  return {} as ValidatorToValue<typeof _v>;
}).types([138, "instantiations"]);

bench("ValidatorToValue<typeof v.literal(1n)>", () => {
  const _v = v.literal(1n);
  return {} as ValidatorToValue<typeof _v>;
}).types([138, "instantiations"]);

// --- GenericId ---

bench('ValidatorToValue<typeof v.id("users")>', () => {
  const _v = v.id("users");
  return {} as ValidatorToValue<typeof _v>;
}).types([138, "instantiations"]);

// --- Arrays ---

bench("ValidatorToValue<typeof v.array(v.string())>", () => {
  const _v = v.array(v.string());
  return {} as ValidatorToValue<typeof _v>;
}).types([145, "instantiations"]);

bench("ValidatorToValue<typeof v.array(v.array(v.string()))>", () => {
  const _v = v.array(v.array(v.string()));
  return {} as ValidatorToValue<typeof _v>;
}).types([165, "instantiations"]);

// --- Objects (small / medium / large) ---

const SmallObject = v.object({ foo: v.string() });
type SmallObject = typeof SmallObject;

bench("small object", () => {
  return {} as ValidatorToValue<SmallObject>;
}).types([203, "instantiations"]);

const MediumObject = v.object({
  foo: v.string(),
  bar: v.float64(),
  baz: v.boolean(),
  items: v.array(v.string()),
});
type MediumObject = typeof MediumObject;

bench("medium object", () => {
  return {} as ValidatorToValue<MediumObject>;
}).types([205, "instantiations"]);

const LargeObject = v.object({
  a: v.string(),
  b: v.float64(),
  c: v.boolean(),
  d: v.int64(),
  e: v.bytes(),
  f: v.null(),
  g: v.array(v.string()),
  h: v.object({ nested: v.float64() }),
  i: v.optional(v.string()),
  j: v.union(v.literal("admin"), v.literal("user")),
});
type LargeObject = typeof LargeObject;

bench("large object", () => {
  return {} as ValidatorToValue<LargeObject>;
}).types([252, "instantiations"]);

// --- Optional fields ---

bench("ValidatorToValue<typeof v.object({ foo: v.optional(v.string()) })>", () => {
  const _v = v.object({ foo: v.optional(v.string()) });
  return {} as ValidatorToValue<typeof _v>;
}).types([279, "instantiations"]);

bench(
  "ValidatorToValue<typeof v.object({ foo: v.optional(v.object({ bar: v.optional(v.float64()) })) })>",
  () => {
    const _v = v.object({
      foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
    });
    return {} as ValidatorToValue<typeof _v>;
  },
).types([492, "instantiations"]);

// --- Unions ---

bench("ValidatorToValue<typeof v.union(v.string(), v.float64())>", () => {
  const _v = v.union(v.string(), v.float64());
  return {} as ValidatorToValue<typeof _v>;
}).types([209, "instantiations"]);

bench(
  'ValidatorToValue<typeof v.union(v.literal("admin"), v.literal("user"))>',
  () => {
    const _v = v.union(v.literal("admin"), v.literal("user"));
    return {} as ValidatorToValue<typeof _v>;
  },
).types([211, "instantiations"]);

bench(
  "ValidatorToValue<typeof v.union(v.string(), v.float64(), v.array(v.boolean()))>",
  () => {
    const _v = v.union(v.string(), v.float64(), v.array(v.boolean()));
    return {} as ValidatorToValue<typeof _v>;
  },
).types([254, "instantiations"]);

// --- Record ---

bench("ValidatorToValue<typeof v.record(v.string(), v.float64())>", () => {
  const _v = v.record(v.string(), v.float64());
  return {} as ValidatorToValue<typeof _v>;
}).types([204, "instantiations"]);
