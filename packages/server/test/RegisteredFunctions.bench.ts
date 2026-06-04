import { bench } from "@ark/attest";
import { Schema } from "effect";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "../src/SchemaToValidator";

// Quantifies the per-function work that `confect codegen --skip-validators`
// eliminates from every cold start: compiling a function's `args` and `returns`
// `Schema` into Convex validators at registration. With the flag set these
// `compileArgsSchema` / `compileReturnsSchema` calls are tree-shaken out and
// never run (confect's handler-level `Schema.decode`/`encode` still enforce
// correctness), so each bench below is pure savings per function per cold start.
//
// Schema shapes mirror the medium / large structs in SchemaToValidator.bench.ts.

const MediumArgs = Schema.Struct({
  text: Schema.String,
  count: Schema.Number,
  active: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  metadata: Schema.optionalWith(
    Schema.Struct({ key: Schema.String, value: Schema.Number }),
    { exact: true },
  ),
});

const LargeArgs = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  active: Schema.Boolean,
  score: Schema.BigIntFromSelf,
  deletedAt: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  address: Schema.Struct({
    street: Schema.String,
    city: Schema.String,
    zip: Schema.Number,
  }),
  notes: Schema.optionalWith(Schema.String, { exact: true }),
  role: Schema.Union(Schema.Literal("admin"), Schema.Literal("user")),
  scores: Schema.Array(Schema.Number),
});

// --- Per-function registration cost (args + returns), by schema size ---
//
// This is the unit of work skipped per function. Multiply by a project's
// function count to estimate the cold-start saving (e.g. ~50 medium functions
// ≈ the medium median × 50).

bench("compile validators: medium function (args + returns)", () => {
  compileArgsSchema(MediumArgs);
  compileReturnsSchema(MediumArgs);
}).median([183.08, "us"]);

bench("compile validators: large function (args + returns)", () => {
  compileArgsSchema(LargeArgs);
  compileReturnsSchema(LargeArgs);
}).median([372.1, "us"]);

// --- The two halves, for granularity ---

bench("compileArgsSchema (large struct)", () => {
  compileArgsSchema(LargeArgs);
}).median([170.4, "us"]);

bench("compileReturnsSchema (large struct)", () => {
  compileReturnsSchema(LargeArgs);
}).median([198.97, "us"]);
