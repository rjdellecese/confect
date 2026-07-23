/**
 * Handlers exercise Confect's storage services inside the real Convex
 * isolate, whose `URL` polyfill lacks `URL.canParse`. Both decode Convex's
 * string return values with `Schema.URLFromString`, so they only succeed if
 * the `URL.canParse` polyfill `@confect/server` installs is in effect.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { StorageReader, StorageWriter } from "../_generated/services";
import storage from "./storage.spec";

const generateUploadUrl = FunctionImpl.make(
  databaseSchema,
  storage,
  "generateUploadUrl",
  () =>
    Effect.gen(function* () {
      const storageWriter = yield* StorageWriter;

      const url = yield* storageWriter.generateUploadUrl();

      return url.toString();
    }),
);

const getUrl = FunctionImpl.make(
  databaseSchema,
  storage,
  "getUrl",
  ({ storageId }) =>
    Effect.gen(function* () {
      const storageReader = yield* StorageReader;

      const url = yield* storageReader.getUrl(storageId);

      return url.toString();
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, storage).pipe(
  Layer.provide(generateUploadUrl),
  Layer.provide(getUrl),
  GroupImpl.finalize,
);
