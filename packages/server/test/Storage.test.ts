import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect, Exit } from "effect";
import { StorageActionWriter } from "../src/StorageActionWriter";
import { StorageReader } from "../src/StorageReader";
import { StorageWriter } from "../src/StorageWriter";

describe("StorageReader", () => {
  it.effect("getUrl succeeds with a valid URL", () =>
    Effect.gen(function* () {
      const fakeStorage = {
        getUrl: async () => "https://example.com/blob",
      };

      const reader = yield* StorageReader.pipe(
        Effect.provide(StorageReader.layer(fakeStorage as any)),
      );

      const url = yield* reader.getUrl("storage123" as any);
      assertTrue(url instanceof URL);
      assertEquals(url.href, "https://example.com/blob");
    }),
  );

  it.effect("getUrl fails with BlobNotFoundError when null", () =>
    Effect.gen(function* () {
      const fakeStorage = {
        getUrl: async () => null,
      };

      const exit = yield* Effect.gen(function* () {
        const reader = yield* StorageReader;
        return yield* reader.getUrl("missing" as any);
      }).pipe(
        Effect.provide(StorageReader.layer(fakeStorage as any)),
        Effect.exit,
      );

      assertTrue(Exit.isFailure(exit));
    }),
  );
});

describe("StorageWriter", () => {
  it.effect("generateUploadUrl succeeds", () =>
    Effect.gen(function* () {
      const fakeStorage = {
        generateUploadUrl: async () => "https://upload.example.com/url",
        delete: async () => {},
      };

      const writer = yield* StorageWriter.pipe(
        Effect.provide(StorageWriter.layer(fakeStorage as any)),
      );

      const url = yield* writer.generateUploadUrl();
      assertTrue(url instanceof URL);
    }),
  );

  it.effect("delete succeeds when blob exists", () =>
    Effect.gen(function* () {
      let deletedId: string | undefined;
      const fakeStorage = {
        generateUploadUrl: async () => "https://upload.example.com/url",
        delete: async (id: string) => {
          deletedId = id;
        },
      };

      const writer = yield* StorageWriter.pipe(
        Effect.provide(StorageWriter.layer(fakeStorage as any)),
      );

      yield* writer.delete("storage_id" as any);
      assertEquals(deletedId, "storage_id");
    }),
  );

  it.effect("delete fails with BlobNotFoundError when blob missing", () =>
    Effect.gen(function* () {
      const fakeStorage = {
        generateUploadUrl: async () => "",
        delete: async () => {
          throw new Error("not found");
        },
      };

      const exit = yield* Effect.gen(function* () {
        const writer = yield* StorageWriter;
        return yield* writer.delete("missing_id" as any);
      }).pipe(
        Effect.provide(StorageWriter.layer(fakeStorage as any)),
        Effect.exit,
      );

      assertTrue(Exit.isFailure(exit));
    }),
  );
});

describe("StorageActionWriter", () => {
  it.effect("get succeeds when blob exists", () =>
    Effect.gen(function* () {
      const blob = new Blob(["hello"]);
      const fakeStorage = {
        get: async () => blob,
        store: async () => "stored_id",
      };

      const writer = yield* StorageActionWriter.pipe(
        Effect.provide(StorageActionWriter.layer(fakeStorage as any)),
      );

      const result = yield* writer.get("blob_id" as any);
      assertTrue(result instanceof Blob);
    }),
  );

  it.effect("get fails with BlobNotFoundError when null", () =>
    Effect.gen(function* () {
      const fakeStorage = {
        get: async () => null,
        store: async () => "stored_id",
      };

      const exit = yield* Effect.gen(function* () {
        const w = yield* StorageActionWriter;
        return yield* w.get("missing_blob" as any);
      }).pipe(
        Effect.provide(StorageActionWriter.layer(fakeStorage as any)),
        Effect.exit,
      );

      assertTrue(Exit.isFailure(exit));
    }),
  );

  it.effect("store stores a blob and returns id", () =>
    Effect.gen(function* () {
      let storedBlob: Blob | undefined;
      const fakeStorage = {
        get: async () => null,
        store: async (blob: Blob, _options?: any) => {
          storedBlob = blob;
          return "stored_id" as any;
        },
      };

      const writer = yield* StorageActionWriter.pipe(
        Effect.provide(StorageActionWriter.layer(fakeStorage as any)),
      );

      const blob = new Blob(["test content"]);
      const result = yield* writer.store(blob, { sha256: "abc" });
      assertEquals(result, "stored_id");
      assertTrue(storedBlob instanceof Blob);
    }),
  );
});
