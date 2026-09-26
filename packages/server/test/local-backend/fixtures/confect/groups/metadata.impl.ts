import { FunctionImpl, GroupImpl, MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import {
  ExecutionMetadata,
  RequestMetadata,
  Transaction,
} from "../_generated/services";
import metadata, { ObserveExecution } from "./metadata.spec";

const readExecution = Effect.gen(function* () {
  const execution = yield* ExecutionMetadata;
  const fn = yield* execution.getFunction();
  const deployment = yield* execution.getDeployment();
  return {
    functionName: fn.name,
    functionType: fn.type,
    deploymentName: deployment.name,
  };
});

const readRequest = Effect.gen(function* () {
  const request = yield* RequestMetadata;
  const info = yield* request.get();
  return {
    requestId: info.requestId,
    ip: info.ip,
    scheduledFunctionId: info.scheduledFunctionId,
  };
});

const queryMetadata = FunctionImpl.make(
  databaseSchema,
  metadata,
  "queryMetadata",
  () =>
    Effect.gen(function* () {
      const execution = yield* readExecution;
      const transaction = yield* Transaction;
      const metrics = yield* transaction.getMetrics();
      return {
        ...execution,
        remainingReads: metrics.documentsRead.remaining,
      };
    }),
);

const mutationMetadata = FunctionImpl.make(
  databaseSchema,
  metadata,
  "mutationMetadata",
  () =>
    Effect.gen(function* () {
      const execution = yield* readExecution;
      const request = yield* readRequest;
      const transaction = yield* Transaction;
      const metrics = yield* transaction.getMetrics();
      return {
        ...execution,
        ...request,
        remainingWrites: metrics.documentsWritten.remaining,
      };
    }),
);

const actionMetadata = FunctionImpl.make(
  databaseSchema,
  metadata,
  "actionMetadata",
  () =>
    Effect.gen(function* () {
      return { ...(yield* readExecution), ...(yield* readRequest) };
    }),
);

const observeExecution = MiddlewareImpl.make(
  databaseSchema,
  ObserveExecution,
  (effect) =>
    Effect.gen(function* () {
      const execution = yield* ExecutionMetadata;
      yield* execution.getFunction();
      return yield* effect;
    }),
);

export default GroupImpl.make(databaseSchema, metadata).pipe(
  Layer.provide(queryMetadata),
  Layer.provide(mutationMetadata),
  Layer.provide(actionMetadata),
  Layer.provide(observeExecution),
  GroupImpl.finalize,
);
