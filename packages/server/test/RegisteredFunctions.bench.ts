import { bench } from "@ark/attest";
import { FunctionSpec, GroupSpec } from "@confect/core";
import { Effect, Layer, Schema } from "effect";
import * as DatabaseSchema from "../src/DatabaseSchema";
import * as FunctionImpl from "../src/FunctionImpl";
import * as GroupImpl from "../src/GroupImpl";
import * as RegisteredConvexFunction from "../src/RegisteredConvexFunction";
import * as RegisteredConvexFunctionWithoutValidators from "../src/RegisteredConvexFunctionWithoutValidators";
import * as RegisteredFunctions from "../src/RegisteredFunctions";
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
}).median([149.67, "us"]);

bench("compile validators: large function (args + returns)", () => {
  compileArgsSchema(LargeArgs);
  compileReturnsSchema(LargeArgs);
}).median([390.51, "us"]);

// --- The two halves, for granularity ---

bench("compileArgsSchema (large struct)", () => {
  compileArgsSchema(LargeArgs);
}).median([137.48, "us"]);

bench("compileReturnsSchema (large struct)", () => {
  compileReturnsSchema(LargeArgs);
}).median([149.89, "us"]);

// --- Whole-group registration (what one cold start of a group actually pays) ---
//
// A Convex entry re-exports its whole group, so cold-starting any function in
// the group runs `buildForGroup` once: it builds the group's Effect Layer graph
// (GroupImpl + one FunctionImpl per function + finalize, run via Effect.runSync
// to harvest the registry) and then builds each function's registered object.
//
// The `with validators` vs `without validators` delta is exactly what
// `--skip-validators` saves for a group of this size. The `without validators`
// absolute is the residual group-layer-build + registered-object cost that the
// flag does NOT remove (and that a future optimization would target).

const databaseSchema = DatabaseSchema.make({});

const makeGroupLayer = (
  functionCount: number,
): Layer.Layer<GroupImpl.GroupImpl<"Finalized">> => {
  let group: any = GroupSpec.make();
  for (let i = 0; i < functionCount; i++) {
    group = group.addFunction(
      FunctionSpec.publicQuery({
        name: `fn${i}`,
        args: () => MediumArgs,
        returns: () => MediumArgs,
      }),
    );
  }

  // Handlers are never invoked by `buildForGroup`; only the registered object
  // (and, for the default builder, the compiled validators) is constructed.
  const handler = () => Effect.succeed(undefined);
  const functionImpls = Array.from({ length: functionCount }, (_, i) =>
    (FunctionImpl.make as any)(databaseSchema, group, `fn${i}`, handler),
  );

  return (GroupImpl.make as any)(databaseSchema, group).pipe(
    Layer.provide(Layer.mergeAll(...(functionImpls as [any, ...any[]]))),
    GroupImpl.finalize,
  );
};

const smallGroup = makeGroupLayer(8);
const largeGroup = makeGroupLayer(40);

bench("buildForGroup: 8 functions, WITH validators", () => {
  RegisteredFunctions.buildForGroup(
    databaseSchema,
    smallGroup,
    RegisteredConvexFunction.make,
  );
}).median([2.2, "ms"]);

bench("buildForGroup: 8 functions, WITHOUT validators", () => {
  RegisteredFunctions.buildForGroup(
    databaseSchema,
    smallGroup,
    RegisteredConvexFunctionWithoutValidators.make,
  );
}).median([726.85, "us"]);

bench("buildForGroup: 40 functions, WITH validators", () => {
  RegisteredFunctions.buildForGroup(
    databaseSchema,
    largeGroup,
    RegisteredConvexFunction.make,
  );
}).median([9.13, "ms"]);

bench("buildForGroup: 40 functions, WITHOUT validators", () => {
  RegisteredFunctions.buildForGroup(
    databaseSchema,
    largeGroup,
    RegisteredConvexFunctionWithoutValidators.make,
  );
}).median([2.48, "ms"]);
