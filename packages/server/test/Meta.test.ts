import type {
  ActionMeta as ConvexActionMeta,
  DeploymentMetadata,
  FunctionMetadata,
  MutationMeta as ConvexMutationMeta,
  QueryMeta as ConvexQueryMeta,
  RequestMetadata,
  TransactionMetrics,
} from "convex/server";
import { Effect } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as Meta from "../src/Meta";

const functionMetadata: FunctionMetadata = {
  name: "groups/meta:read",
  componentPath: "",
  type: "query",
  visibility: "public",
};

const deploymentMetadata: DeploymentMetadata = {
  name: "local-team-project",
  region: null,
  class: "s16",
};

const requestMetadata: RequestMetadata = {
  ip: "127.0.0.1",
  userAgent: "vitest",
  requestId: "req_123",
};

const transactionMetrics: TransactionMetrics = {
  bytesRead: { used: 1, remaining: 2 },
  bytesWritten: { used: 3, remaining: 4 },
  databaseQueries: { used: 5, remaining: 6 },
  documentsRead: { used: 7, remaining: 8 },
  documentsWritten: { used: 9, remaining: 10 },
  functionsScheduled: { used: 11, remaining: 12 },
  scheduledFunctionArgsBytes: { used: 13, remaining: 14 },
};

describe("Meta", () => {
  test("QueryMeta exposes function, deployment, and transaction metadata", async () => {
    const convexMeta: ConvexQueryMeta = {
      getFunctionMetadata: () => Promise.resolve(functionMetadata),
      getDeploymentMetadata: () => Promise.resolve(deploymentMetadata),
      getTransactionMetrics: () => Promise.resolve(transactionMetrics),
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const meta = yield* Meta.QueryMeta;

        expectTypeOf(meta.getFunctionMetadata).returns.toEqualTypeOf<
          Effect.Effect<FunctionMetadata>
        >();
        expectTypeOf(meta.getDeploymentMetadata).returns.toEqualTypeOf<
          Effect.Effect<DeploymentMetadata>
        >();
        expectTypeOf(meta.getTransactionMetrics).returns.toEqualTypeOf<
          Effect.Effect<TransactionMetrics>
        >();

        return {
          functionMetadata: yield* meta.getFunctionMetadata(),
          deploymentMetadata: yield* meta.getDeploymentMetadata(),
          transactionMetrics: yield* meta.getTransactionMetrics(),
        };
      }).pipe(Effect.provide(Meta.QueryMeta.layer(convexMeta))),
    );

    expect(result).toStrictEqual({
      functionMetadata,
      deploymentMetadata,
      transactionMetrics,
    });
  });

  test("MutationMeta also exposes request metadata", async () => {
    const convexMeta: ConvexMutationMeta = {
      getFunctionMetadata: () =>
        Promise.resolve({ ...functionMetadata, type: "mutation" }),
      getDeploymentMetadata: () => Promise.resolve(deploymentMetadata),
      getTransactionMetrics: () => Promise.resolve(transactionMetrics),
      getRequestMetadata: () => Promise.resolve(requestMetadata),
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const meta = yield* Meta.MutationMeta;

        expectTypeOf(meta.getRequestMetadata).returns.toEqualTypeOf<
          Effect.Effect<RequestMetadata>
        >();

        return yield* meta.getRequestMetadata();
      }).pipe(Effect.provide(Meta.MutationMeta.layer(convexMeta))),
    );

    expect(result).toStrictEqual(requestMetadata);
  });

  test("ActionMeta exposes function, deployment, and request metadata", async () => {
    const convexMeta: ConvexActionMeta = {
      getFunctionMetadata: () =>
        Promise.resolve({ ...functionMetadata, type: "action" }),
      getDeploymentMetadata: () => Promise.resolve(deploymentMetadata),
      getRequestMetadata: () => Promise.resolve(requestMetadata),
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const meta = yield* Meta.ActionMeta;

        expectTypeOf(meta.getRequestMetadata).returns.toEqualTypeOf<
          Effect.Effect<RequestMetadata>
        >();

        return {
          functionMetadata: yield* meta.getFunctionMetadata(),
          deploymentMetadata: yield* meta.getDeploymentMetadata(),
          requestMetadata: yield* meta.getRequestMetadata(),
        };
      }).pipe(Effect.provide(Meta.ActionMeta.layer(convexMeta))),
    );

    expect(result).toStrictEqual({
      functionMetadata: { ...functionMetadata, type: "action" },
      deploymentMetadata,
      requestMetadata,
    });
  });
});
