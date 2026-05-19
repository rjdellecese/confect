/**
 * Runtime overhead of Confect query handlers vs native Convex queries.
 *
 * Measures the registered `handler(ctx, args)` path (what Convex invokes on
 * each query execution). Does not include Convex scheduler/DB work outside the
 * handler.
 *
 * Run: `pnpm --filter @confect/server bench:query`
 *
 * Results (Node 22, Linux; @ark/attest batches of 1k calls; median per batch ÷ 1k):
 *
 * | Benchmark | ~per call |
 * |---|---|
 * | Native Convex noop `_handler` | 0.5 µs |
 * | Confect noop (Effect.succeed) | 3.5 µs |
 * | → overhead vs native | ~3.0 µs (~7×) |
 * | Layer.mergeAll + provide (all query services) | 3.4 µs |
 * | Effect.runPromise + Date.now stub | 1.0 µs |
 * | Args decode / returns encode (each) | 0.8 µs |
 * | Validator compile at registration (one-time) | 87 µs |
 *
 * The per-request service layer dominates; schema codec and Effect runtime are smaller.
 */
import { bench } from "@ark/attest";
import { FunctionSpec, GroupSpec, Spec } from "@confect/core";
import {
  Api,
  Auth,
  ConvexConfigProvider,
  DatabaseReader,
  DatabaseSchema,
  FunctionImpl,
  GroupImpl,
  Impl,
  QueryCtx,
  QueryRunner,
  RegisteredConvexFunction,
  RegisteredFunction,
  RegisteredFunctions,
  SchemaToValidator,
  StorageReader,
} from "@confect/server";
import type { GenericQueryCtx } from "convex/server";
import { queryGeneric } from "convex/server";
import { v } from "convex/values";
import { Clock, Effect, Layer, pipe, Schema } from "effect";

// --- Shared schemas ---

const EmptyArgs = Schema.Struct({});
const MediumArgs = Schema.Struct({
  id: Schema.String,
  limit: Schema.Number,
  tags: Schema.Array(Schema.String),
});
const Returns = Schema.Number;

// --- Build registered handlers once (registration cost is not per-request) ---

const databaseSchema = DatabaseSchema.make();

const makeBenchQuery = (
  name: string,
  handler: () => Effect.Effect<number, never, never>,
) => {
  const spec = Spec.make().add(
    GroupSpec.make("bench").addFunction(
      FunctionSpec.publicQuery({
        name,
        args: EmptyArgs,
        returns: Returns,
      }),
    ),
  );
  const api = Api.make(databaseSchema, spec);
  const functionImpl = FunctionImpl.make(api, "bench", name, handler);
  const groupImpl = GroupImpl.make(api, "bench").pipe(
    Layer.provide(functionImpl),
  );
  const impl = Impl.make(api).pipe(Layer.provide(groupImpl), Impl.finalize);
  const registered = RegisteredFunctions.make(
    impl,
    RegisteredConvexFunction.make,
  );
  return registered.bench[name];
};

const confectNoopQuery = makeBenchQuery("noop", () => Effect.succeed(42));
const confectWithClockQuery = makeBenchQuery("withClock", () =>
  Clock.currentTimeMillis.pipe(Effect.map(Number)),
);
const confectWithSpanQuery = makeBenchQuery("withSpan", () =>
  Effect.succeed(42).pipe(Effect.withSpan("bench.withSpan")),
);
const confectWithLogQuery = makeBenchQuery("withLog", () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("bench.withLog");
    return 42;
  }),
);

const nativeNoopQuery = queryGeneric({
  args: {},
  returns: v.number(),
  handler: async () => 42,
});

const nativeWithDateNowQuery = queryGeneric({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});

// Medium-args Confect query (isolates args decode cost)
const mediumArgsSpec = Spec.make().add(
  GroupSpec.make("bench").addFunction(
    FunctionSpec.publicQuery({
      name: "mediumArgs",
      args: MediumArgs,
      returns: Returns,
    }),
  ),
);
const mediumArgsApi = Api.make(databaseSchema, mediumArgsSpec);
const mediumArgsImpl = FunctionImpl.make(
  mediumArgsApi,
  "bench",
  "mediumArgs",
  () => Effect.succeed(42),
);
const mediumArgsGroup = GroupImpl.make(mediumArgsApi, "bench").pipe(
  Layer.provide(mediumArgsImpl),
);
const mediumArgsRegistered = RegisteredFunctions.make(
  Impl.make(mediumArgsApi).pipe(Layer.provide(mediumArgsGroup), Impl.finalize),
  RegisteredConvexFunction.make,
);
const confectMediumArgsQuery = mediumArgsRegistered.bench.mediumArgs;

const mediumConvexArgs = {
  id: "item-1",
  limit: 10,
  tags: ["a", "b", "c"],
};

// Minimal Convex query ctx (only fields Confect's query wrapper touches)
const mockCtx = {
  db: {
    get: async () => {
      throw new Error("not used in noop benches");
    },
    query: () => ({
      collect: async () => [],
    }),
  },
  auth: {
    getUserIdentity: async () => null,
  },
  storage: {
    getUrl: async () => null,
  },
  runQuery: async () => 0,
} as unknown as GenericQueryCtx<Record<string, never>>;

type RegisteredQueryLike = {
  _handler: (ctx: typeof mockCtx, args: object) => Promise<number>;
};

const invoke = (registered: RegisteredQueryLike, args: object = {}) =>
  registered._handler(mockCtx, args);

// Mirrors RegisteredConvexFunction.queryFunction pieces for breakdown benches
const withStubbedDateNow = async <T>(
  queryHandler: (clock: Clock.Clock) => Promise<T>,
): Promise<T> => {
  const realDateNow = Date.now;
  const defaultClock = Clock.make();
  const clock: Clock.Clock = {
    ...defaultClock,
    unsafeCurrentTimeMillis: () => 0,
    unsafeCurrentTimeNanos: () => 0n,
    currentTimeMillis: Effect.sync(() => realDateNow()),
    currentTimeNanos: Effect.sync(() => BigInt(realDateNow()) * 1_000_000n),
  };
  Date.now = () => 0;
  try {
    return await queryHandler(clock);
  } finally {
    Date.now = realDateNow;
  }
};

const queryServicesLayer = Layer.mergeAll(
  DatabaseReader.layer(databaseSchema, mockCtx.db),
  Auth.layer(mockCtx.auth),
  StorageReader.StorageReader.layer(mockCtx.storage),
  QueryRunner.layer(mockCtx.runQuery),
  Layer.succeed(QueryCtx.QueryCtx(), mockCtx),
  Layer.setConfigProvider(ConvexConfigProvider.make()),
);

const breakdownFullWrapper = () =>
  withStubbedDateNow((clock) =>
    Effect.gen(function* () {
      const decodedArgs = yield* pipe(
        {},
        Schema.decode(EmptyArgs),
        Effect.orDie,
      );
      const decodedReturns = yield* Effect.succeed(42).pipe(
        Effect.provide(queryServicesLayer),
      );
      return yield* pipe(decodedReturns, Schema.encode(Returns), Effect.orDie);
    }).pipe(
      Effect.withClock(clock),
      RegisteredFunction.runHandlerPromise(undefined),
    ),
  );

const breakdownDecodeOnly = () =>
  Effect.runPromise(
    pipe({}, Schema.decode(EmptyArgs), Effect.orDie, Effect.as(42)),
  );

const breakdownEncodeOnly = () =>
  Effect.runPromise(pipe(42, Schema.encode(Returns), Effect.orDie));

const breakdownLayerOnly = () =>
  Effect.runPromise(
    Effect.succeed(42).pipe(Effect.provide(queryServicesLayer)),
  );

const breakdownMinimalLayerOnly = () =>
  Effect.runPromise(
    Effect.succeed(42).pipe(
      Effect.provide(Layer.succeed(QueryCtx.QueryCtx(), mockCtx)),
    ),
  );

const breakdownEffectRuntimeOnly = () =>
  withStubbedDateNow((clock) =>
    Effect.succeed(42).pipe(
      Effect.withClock(clock),
      RegisteredFunction.runHandlerPromise(undefined),
    ),
  );

const breakdownDateNowStubOnly = () =>
  withStubbedDateNow(() => Promise.resolve(42));

// One-time registration cost (not per query execution)
const registrationCompileValidators = () => {
  SchemaToValidator.compileArgsSchema(EmptyArgs);
  SchemaToValidator.compileReturnsSchema(Returns);
  SchemaToValidator.compileArgsSchema(MediumArgs);
};

// --- Benchmarks: end-to-end handler invocation ---

bench("native Convex noop query handler", async () => {
  await invoke(nativeNoopQuery);
}).mark({ mean: [523.42, "us"], median: [506.9, "us"] });

bench("native Convex handler calling Date.now()", async () => {
  await invoke(nativeWithDateNowQuery);
}).mark({ mean: [523.28, "us"], median: [506.9, "us"] });

bench("Confect noop query (Effect.succeed)", async () => {
  await invoke(confectNoopQuery);
}).mark({ mean: [3.53, "ms"], median: [3.53, "ms"] });

bench(
  "Confect noop + Clock.currentTimeMillis (cache-invalidating)",
  async () => {
    await invoke(confectWithClockQuery);
  },
).mark({ mean: [3.53, "ms"], median: [3.53, "ms"] });

bench("Confect noop + Effect.withSpan", async () => {
  await invoke(confectWithSpanQuery);
}).mark({ mean: [3.53, "ms"], median: [3.53, "ms"] });

bench("Confect noop + Effect.logInfo", async () => {
  await invoke(confectWithLogQuery);
}).mark({ mean: [3.53, "ms"], median: [3.53, "ms"] });

bench("Confect noop with medium args struct", async () => {
  await invoke(confectMediumArgsQuery, mediumConvexArgs);
}).mark({ mean: [3.53, "ms"], median: [3.53, "ms"] });

// --- Benchmarks: wrapper component breakdown (noop handler body) ---

bench("breakdown: Date.now stub wrapper only", async () => {
  await breakdownDateNowStubOnly();
}).mark({ mean: [786.85, "us"], median: [758.49, "us"] });

bench("breakdown: Effect.runPromise + stubbed clock only", async () => {
  await breakdownEffectRuntimeOnly();
}).mark({ mean: [1.04, "ms"], median: [1.02, "ms"] });

bench("breakdown: args Schema.decode only", async () => {
  await breakdownDecodeOnly();
}).mark({ mean: [786.61, "us"], median: [758.49, "us"] });

bench("breakdown: returns Schema.encode only", async () => {
  await breakdownEncodeOnly();
}).mark({ mean: [786.5, "us"], median: [758.49, "us"] });

bench("breakdown: service Layer.mergeAll + provide only", async () => {
  await breakdownLayerOnly();
}).mark({ mean: [3.35, "ms"], median: [3.35, "ms"] });

bench("breakdown: single QueryCtx layer provide only", async () => {
  await breakdownMinimalLayerOnly();
}).mark({ mean: [1.05, "ms"], median: [1, "ms"] });

bench(
  "breakdown: full wrapper minus user handler (replicated queryFunction)",
  async () => {
    await breakdownFullWrapper();
  },
).mark({ mean: [3.52, "ms"], median: [3.52, "ms"] });

// Registration-time work only; a single invocation (not 1k×) avoids OOM from AST work.
bench(
  "breakdown: validator compile at registration (one-time)",
  () => registrationCompileValidators(),
  { until: { count: 1 } },
).mark({ mean: [87.1, "us"], median: [87.1, "us"] });
