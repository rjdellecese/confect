import type {
  StorageActionWriter as ConvexStorageActionWriter,
  StorageReader as ConvexStorageReader,
  StorageWriter as ConvexStorageWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect, Exit } from "effect";
import { StorageActionWriter } from "../src/StorageActionWriter";
import { StorageReader } from "../src/StorageReader";
import { StorageWriter } from "../src/StorageWriter";

const testStorageReader = (
  urls: Record<string, string>,
): ConvexStorageReader => ({
  getUrl: (storageId: GenericId<"_storage">) =>
    Promise.resolve(urls[storageId as string] ?? null) as Promise<
      string | null
    >,
  getMetadata: () => Promise.resolve(null),
});

const testStorageWriter = (existingIds: Set<string>): ConvexStorageWriter => ({
  generateUploadUrl: () => Promise.resolve("https://upload.example.com/url"),
  delete: (storageId: GenericId<"_storage">) =>
    existingIds.has(storageId as string)
      ? Promise.resolve()
      : Promise.reject(new Error("not found")),
  getUrl: (_storageId: GenericId<"_storage">) =>
    Promise.resolve(null) as Promise<string | null>,
  getMetadata: () => Promise.resolve(null),
});

const testStorageActionWriter = (
  blobs: Map<string, Blob>,
): ConvexStorageActionWriter => ({
  get: (storageId: GenericId<"_storage">) =>
    Promise.resolve(
      blobs.get(storageId as string) ?? null,
    ) as Promise<Blob | null>,
  store: (blob: Blob) => {
    const id = `stored_${blobs.size}` as GenericId<"_storage">;
    blobs.set(id, blob);
    return Promise.resolve(id);
  },
  generateUploadUrl: () => Promise.resolve("https://upload.example.com/url"),
  delete: () => Promise.resolve(),
  getUrl: (_storageId: GenericId<"_storage">) =>
    Promise.resolve(null) as Promise<string | null>,
  getMetadata: () => Promise.resolve(null),
});

describe("StorageReader", () => {
  it.effect("getUrl succeeds with a valid URL", () =>
    Effect.gen(function* () {
      const reader = yield* StorageReader;
      const url = yield* reader.getUrl("s1" as GenericId<"_storage">);
      assertTrue(url instanceof URL);
      assertEquals(url.href, "https://example.com/blob");
    }).pipe(
      Effect.provide(
        StorageReader.layer(
          testStorageReader({ s1: "https://example.com/blob" }),
        ),
      ),
    ),
  );

  it.effect("getUrl fails with BlobNotFoundError when not found", () =>
    Effect.gen(function* () {
      const reader = yield* StorageReader;
      const exit = yield* reader
        .getUrl("missing" as GenericId<"_storage">)
        .pipe(Effect.exit);
      assertTrue(Exit.isFailure(exit));
    }).pipe(Effect.provide(StorageReader.layer(testStorageReader({})))),
  );
});

describe("StorageWriter", () => {
  it.effect("generateUploadUrl succeeds", () =>
    Effect.gen(function* () {
      const writer = yield* StorageWriter;
      const url = yield* writer.generateUploadUrl();
      assertTrue(url instanceof URL);
    }).pipe(
      Effect.provide(StorageWriter.layer(testStorageWriter(new Set(["x"])))),
    ),
  );

  it.effect("delete succeeds when blob exists", () =>
    Effect.gen(function* () {
      const writer = yield* StorageWriter;
      yield* writer.delete("storage_id" as GenericId<"_storage">);
    }).pipe(
      Effect.provide(
        StorageWriter.layer(testStorageWriter(new Set(["storage_id"]))),
      ),
    ),
  );

  it.effect("delete fails with BlobNotFoundError when blob missing", () =>
    Effect.gen(function* () {
      const writer = yield* StorageWriter;
      const exit = yield* writer
        .delete("missing_id" as GenericId<"_storage">)
        .pipe(Effect.exit);
      assertTrue(Exit.isFailure(exit));
    }).pipe(Effect.provide(StorageWriter.layer(testStorageWriter(new Set())))),
  );
});

describe("StorageActionWriter", () => {
  it.effect("get succeeds when blob exists", () =>
    Effect.gen(function* () {
      const writer = yield* StorageActionWriter;
      const result = yield* writer.get("blob_id" as GenericId<"_storage">);
      assertTrue(result instanceof Blob);
    }).pipe(
      Effect.provide(
        StorageActionWriter.layer(
          testStorageActionWriter(
            new Map([
              ["blob_id" as GenericId<"_storage">, new Blob(["hello"])],
            ]),
          ),
        ),
      ),
    ),
  );

  it.effect("get fails with BlobNotFoundError when not found", () =>
    Effect.gen(function* () {
      const writer = yield* StorageActionWriter;
      const exit = yield* writer
        .get("missing_blob" as GenericId<"_storage">)
        .pipe(Effect.exit);
      assertTrue(Exit.isFailure(exit));
    }).pipe(
      Effect.provide(
        StorageActionWriter.layer(testStorageActionWriter(new Map())),
      ),
    ),
  );

  it.effect("store stores a blob and returns id", () =>
    Effect.gen(function* () {
      const writer = yield* StorageActionWriter;
      const blob = new Blob(["test content"]);
      const result = yield* writer.store(blob, { sha256: "abc" });
      assertEquals(result, "stored_0");
    }).pipe(
      Effect.provide(
        StorageActionWriter.layer(testStorageActionWriter(new Map())),
      ),
    ),
  );
});
