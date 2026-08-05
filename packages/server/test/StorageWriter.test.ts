import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { StorageWriter } from "@confect/server/StorageWriter";

const uploadUrl =
  "https://happy-animal-123.convex.cloud/api/storage/upload?token=abc123";

const fakeConvexStorageWriter = {
  generateUploadUrl: () => Promise.resolve(uploadUrl),
} as unknown as ConvexStorageWriter;

describe("StorageWriter", () => {
  it.effect("generateUploadUrl decodes the string Convex returns", () =>
    Effect.gen(function* () {
      const storageWriter = yield* StorageWriter;

      const url = yield* storageWriter.generateUploadUrl();

      expect(url).toBeInstanceOf(URL);
      expect(url.href).toBe(uploadUrl);
    }).pipe(Effect.provide(StorageWriter.layer(fakeConvexStorageWriter))),
  );
});
