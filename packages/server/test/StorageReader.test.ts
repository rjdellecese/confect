import type { StorageReader as ConvexStorageReader } from "convex/server";
import { GenericId } from "@confect/core/GenericId";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "@confect/server/BlobNotFoundError";
import { StorageReader } from "@confect/server/StorageReader";

const storageId = Schema.decodeUnknownSync(GenericId("_storage"))("storage-id");

const blobUrl =
  "https://happy-animal-123.convex.cloud/api/storage/11111111-2222-3333-4444-555555555555";

const fakeConvexStorageReader = (url: string | null) =>
  ({
    getUrl: () => Promise.resolve(url),
    getMetadata: () => Promise.resolve(null),
  }) satisfies ConvexStorageReader;

describe("StorageReader", () => {
  it.effect("getUrl decodes the string Convex returns", () =>
    Effect.gen(function* () {
      const storageReader = yield* StorageReader;

      const url = yield* storageReader.getUrl(storageId);

      expect(url).toBeInstanceOf(URL);
      expect(url.href).toBe(blobUrl);
    }).pipe(
      Effect.provide(StorageReader.layer(fakeConvexStorageReader(blobUrl))),
    ),
  );

  it.effect(
    "getUrl fails with BlobNotFoundError when Convex returns null",
    () =>
      Effect.gen(function* () {
        const storageReader = yield* StorageReader;

        const error = yield* Effect.flip(storageReader.getUrl(storageId));

        expect(error).toBeInstanceOf(BlobNotFoundError);
        expect(error.id).toBe(storageId);
      }).pipe(
        Effect.provide(StorageReader.layer(fakeConvexStorageReader(null))),
      ),
  );
});
