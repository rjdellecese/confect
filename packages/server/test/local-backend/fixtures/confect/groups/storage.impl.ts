/**
 * Handlers exercise Confect's storage service inside the real Convex isolate.
 * URL operations decode Convex's string return values with
 * `Schema.URLFromString`, so they only succeed if that string→URL decode works
 * in the isolate.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { Storage } from "../_generated/services";
import storage from "./storage.spec";

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
  Layer.provide(generateUploadUrl),
  Layer.provide(getUrl),
  Layer.provide(store),
  Layer.provide(get),
  Layer.provide(deleteBlob),
  GroupImpl.finalize,
);
