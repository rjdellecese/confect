import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { StorageWriter } from "@confect/server/StorageWriter";
import { installURLCanParsePolyfill } from "../src/internal/urlCanParsePolyfill";

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

  it.effect(
    "generateUploadUrl decodes without a native URL.canParse, as in the Convex isolate",
    () =>
      Effect.gen(function* () {
        const nativeCanParse = URL.canParse;
        delete (URL as { canParse?: typeof URL.canParse }).canParse;
        installURLCanParsePolyfill();

        const storageWriter = yield* StorageWriter;

        const url = yield* storageWriter.generateUploadUrl().pipe(
          Effect.ensuring(
            Effect.sync(() =>
              Object.defineProperty(URL, "canParse", {
                value: nativeCanParse,
                writable: true,
                enumerable: false,
                configurable: true,
              }),
            ),
          ),
        );

        expect(url).toBeInstanceOf(URL);
        expect(url.href).toBe(uploadUrl);
      }).pipe(Effect.provide(StorageWriter.layer(fakeConvexStorageWriter))),
  );
});
