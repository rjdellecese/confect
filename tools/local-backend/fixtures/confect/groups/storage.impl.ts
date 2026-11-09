/**
 * Handlers exercise Confect's storage service inside the real Convex isolate.
 * URL operations decode Convex's string return values with
 * `Schema.URLFromString`, so they only succeed if that string→URL decode works
 * in the isolate.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import type { GenericId } from "convex/values";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import refs from "../_generated/refs";
import {
  MutationRunner,
  QueryRunner,
  Storage,
  TransactionMetadata,
} from "../_generated/services";
import storage, { StorageRollback } from "./storage.spec";

const readBlob = Effect.fn("storage.readBlob")(function* (
  storageId: GenericId<"_storage">,
) {
  const storageService = yield* Storage;
  const blob = yield* storageService.get(storageId);
  return {
    storageId,
    text: yield* Effect.promise(() => blob.text()),
    type: blob.type,
    size: blob.size,
  };
});

const readFileMetrics = Effect.gen(function* () {
  const transaction = yield* TransactionMetadata;
  const metrics = yield* transaction.getMetrics();
  return {
    filesRead: metrics.filesRead.used,
    fileReadBytes: metrics.fileReadBytes.used,
    filesWritten: metrics.filesWritten.used,
    fileWriteBytes: metrics.fileWriteBytes.used,
  };
});

const storeMutation = FunctionImpl.make(
  databaseSchema,
  storage,
  "storeMutation",
  ({ text, type, sha256 }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      const storageId = yield* storageService.store(
        new Blob([text], { type }),
        sha256 === undefined ? undefined : { sha256 },
      );
      return yield* readBlob(storageId);
    }).pipe(Effect.orDie),
);

const getMutation = FunctionImpl.make(
  databaseSchema,
  storage,
  "getMutation",
  ({ storageId }) => readBlob(storageId).pipe(Effect.orDie),
);

const deleteAndGet = FunctionImpl.make(
  databaseSchema,
  storage,
  "deleteAndGet",
  ({ storageId }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      yield* storageService.delete(storageId);
      const error = yield* Effect.flip(storageService.get(storageId));
      return { id: error.id, tag: error._tag };
    }).pipe(Effect.orDie),
);

const replaceThenFail = FunctionImpl.make(
  databaseSchema,
  storage,
  "replaceThenFail",
  ({ parentId, readId }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      yield* storageService.get(readId).pipe(Effect.orDie);
      yield* storageService.delete(parentId).pipe(Effect.orDie);
      const storageId = yield* storageService.store(new Blob(["child"]));
      return yield* StorageRollback.make({ storageId });
    }),
);

const rollback = FunctionImpl.make(
  databaseSchema,
  storage,
  "rollback",
  ({ readId }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      const mutations = yield* MutationRunner;
      const parentId = yield* storageService.store(new Blob(["parent"]));
      const rolledBackId = yield* mutations
        .runMutation(refs.internal.groups.storage.replaceThenFail, {
          parentId,
          readId,
        })
        .pipe(
          Effect.catchTag("StorageRollback", (error) =>
            Effect.succeed(error.storageId),
          ),
        );
      yield* storageService.get(readId);
      yield* storageService.get(parentId);
      return { parentId, rolledBackId, metrics: yield* readFileMetrics };
    }).pipe(Effect.orDie),
);

const pendingUrl = FunctionImpl.make(
  databaseSchema,
  storage,
  "pendingUrl",
  ({ storageId }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      return yield* storageService.getUrl(storageId).pipe(
        Effect.map((url) => url.toString()),
        Effect.catchTag("BlobNotFoundError", () => Effect.succeed(null)),
      );
    }),
);

const staleRead = FunctionImpl.make(
  databaseSchema,
  storage,
  "staleRead",
  ({ stale }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      const queries = yield* QueryRunner;
      const storageId = yield* storageService.store(new Blob(["pending"]));
      const url = yield* queries.runQuery(
        refs.internal.groups.storage.pendingUrl,
        { storageId },
        { useStaleSnapshot: stale },
      );
      const blob = yield* readBlob(storageId);
      return { storageId, url, text: blob.text };
    }).pipe(Effect.orDie),
);

const exerciseFiles = FunctionImpl.make(
  databaseSchema,
  storage,
  "exerciseFiles",
  ({ sizes, storageIds }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      const storedIds: GenericId<"_storage">[] = [];
      const failures: string[] = [];
      for (const size of sizes) {
        const result = yield* Effect.exit(
          storageService.store(new Blob([new Uint8Array(size)])),
        );
        if (Exit.isFailure(result)) failures.push(Cause.pretty(result.cause));
        else {
          storedIds.push(result.value);
          yield* storageService.get(result.value);
        }
      }
      for (const storageId of storageIds) {
        const result = yield* Effect.exit(storageService.get(storageId));
        if (Exit.isFailure(result)) failures.push(Cause.pretty(result.cause));
      }
      return {
        storageIds: storedIds,
        failures,
        metrics: yield* readFileMetrics,
      };
    }).pipe(Effect.orDie),
);

const limitedFiles = FunctionImpl.make(
  databaseSchema,
  storage,
  "limitedFiles",
  ({ limits, ...args }) =>
    Effect.gen(function* () {
      const mutations = yield* MutationRunner;
      return yield* mutations.runMutation(
        refs.internal.groups.storage.exerciseFiles,
        args,
        { transactionLimits: limits },
      );
    }).pipe(Effect.orDie),
);

const generateUploadUrl = FunctionImpl.make(
  databaseSchema,
  storage,
  "generateUploadUrl",
  () =>
    Effect.gen(function* () {
      const storageService = yield* Storage;

      const url = yield* storageService.generateUploadUrl;

      return url.toString();
    }),
);

const getUrl = FunctionImpl.make(
  databaseSchema,
  storage,
  "getUrl",
  ({ storageId }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;

      const url = yield* storageService.getUrl(storageId);

      return url.toString();
    }).pipe(Effect.orDie),
);

const store = FunctionImpl.make(databaseSchema, storage, "store", ({ text }) =>
  Effect.gen(function* () {
    const storageService = yield* Storage;

    return yield* storageService.store(
      new Blob([text], { type: "text/plain" }),
    );
  }),
);

const get = FunctionImpl.make(databaseSchema, storage, "get", ({ storageId }) =>
  Effect.gen(function* () {
    const storageService = yield* Storage;
    const blob = yield* storageService.get(storageId);

    return yield* Effect.promise(() => blob.text());
  }).pipe(Effect.orDie),
);

const deleteBlob = FunctionImpl.make(
  databaseSchema,
  storage,
  "deleteBlob",
  ({ storageId }) =>
    Effect.gen(function* () {
      const storageService = yield* Storage;
      yield* storageService.delete(storageId);

      return null;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, storage).pipe(
  Layer.provide(storeMutation),
  Layer.provide(getMutation),
  Layer.provide(deleteAndGet),
  Layer.provide(replaceThenFail),
  Layer.provide(rollback),
  Layer.provide(pendingUrl),
  Layer.provide(staleRead),
  Layer.provide(exerciseFiles),
  Layer.provide(limitedFiles),
  Layer.provide(generateUploadUrl),
  Layer.provide(getUrl),
  Layer.provide(store),
  Layer.provide(get),
  Layer.provide(deleteBlob),
  GroupImpl.finalize,
);
