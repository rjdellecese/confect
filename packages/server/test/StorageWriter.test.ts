import * as Layer from "effect/Layer";
import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { StorageWriter } from "@confect/server/StorageWriter";

const uploadUrl =
  "https://happy-animal-123.convex.cloud/api/storage/upload?token=abc123";

const fakeConvexStorageWriter = {
  delete: () => Promise.resolve(),
  generateUploadUrl: () => Promise.resolve(uploadUrl),
  get: () => Promise.resolve(null),
  getMetadata: () => Promise.resolve(null),
  getUrl: () => Promise.resolve(null),
  store: () => Promise.reject(new Error("Unexpected store call")),
} satisfies ConvexStorageWriter;

describe("StorageWriter", () => {
  it.effect("generateUploadUrl decodes the string Convex returns", () =>
    Effect.gen(function* () {
      const services = yield* Layer.build(
        StorageWriter.layer(fakeConvexStorageWriter),
      );
      return yield* Effect.gen(function* () {
        const storageWriter = yield* StorageWriter;

        const url = yield* storageWriter.generateUploadUrl;

        expect(url).toBeInstanceOf(URL);
        expect(url.href).toBe(uploadUrl);
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped),
  );
});
