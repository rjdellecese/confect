import { FunctionImpl, GroupImpl, MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import refs from "../_generated/refs";
import {
  DatabaseWriter,
  ExecutionMetadata,
  MutationRunner,
  QueryRunner,
  RequestMetadata,
  TransactionMetadata,
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
      const transaction = yield* TransactionMetadata;
      const metrics = yield* transaction.getMetrics();
      return {
        ...execution,
        remainingReads: metrics.documentsRead.remaining,
        snapshotTs: yield* transaction.getSnapshotTs(),
        repeatedSnapshotTs: yield* transaction.getSnapshotTs(),
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
      const transaction = yield* TransactionMetadata;
      const queries = yield* QueryRunner;
      const mutations = yield* MutationRunner;
      const snapshotTs = yield* transaction.getSnapshotTs();
      const nestedQuery = yield* queries.runQuery(
        refs.public.groups.metadata.queryMetadata,
      );
      const staleQuery = yield* queries.runQuery(
        refs.public.groups.metadata.queryMetadata,
        {},
        { useStaleSnapshot: true },
      );
      const nestedMutation = yield* mutations.runMutation(
        refs.internal.groups.metadata.snapshotMutation,
      );
      const metrics = yield* transaction.getMetrics();
      return {
        ...execution,
        ...request,
        remainingWrites: metrics.documentsWritten.remaining,
        snapshotTs,
        repeatedSnapshotTs: yield* transaction.getSnapshotTs(),
        nestedQueryTs: nestedQuery.snapshotTs,
        staleQueryTs: staleQuery.snapshotTs,
        nestedMutationTs: nestedMutation.before,
        nestedMutationAfterWriteTs: nestedMutation.after,
      };
    }).pipe(Effect.orDie),
);

const snapshotMutation = FunctionImpl.make(
  databaseSchema,
  metadata,
  "snapshotMutation",
  () =>
    Effect.gen(function* () {
      const transaction = yield* TransactionMetadata;
      const writer = yield* DatabaseWriter;
      const before = yield* transaction.getSnapshotTs();
      yield* writer
        .table("transactionNotes")
        .insert({ caseId: "snapshot-metadata", value: "pending" });
      return { before, after: yield* transaction.getSnapshotTs() };
    }).pipe(Effect.orDie),
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
  Layer.provide(snapshotMutation),
  Layer.provide(actionMetadata),
  Layer.provide(observeExecution),
  GroupImpl.finalize,
);
