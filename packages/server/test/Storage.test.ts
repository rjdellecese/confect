import * as Storage from "@confect/server/Storage";
import { BlobNotFoundError } from "@confect/server/BlobNotFoundError";
import { StorageActionWriter } from "@confect/server/StorageActionWriter";
import { StorageReader } from "@confect/server/StorageReader";
import { StorageWriter } from "@confect/server/StorageWriter";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { StorageActionWriter as ConvexStorageActionWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const storageId = "storage-id" as GenericId<"_storage">;
const blobUrl = "https://example.com/storage/blob";
const uploadUrl = "https://example.com/storage/upload";

const makeNativeStorage = () =>
  ({
    getUrl: vi.fn((): Promise<string | null> => Promise.resolve(blobUrl)),
    getMetadata: vi.fn(() => Promise.resolve(null)),
    generateUploadUrl: vi.fn(() => Promise.resolve(uploadUrl)),
    delete: vi.fn(() => Promise.resolve()),
    get: vi.fn((): Promise<Blob | null> =>
      Promise.resolve(new Blob(["stored"])),
    ),
    store: vi.fn((_blob: Blob, _options?: { sha256?: string }) =>
      Promise.resolve(storageId),
    ),
  }) satisfies ConvexStorageActionWriter;

describe("Storage", () => {
  it.effect(
    "reads URLs with only the reader layer and retains the legacy reader",
    () => {
      const native = makeNativeStorage();
      const original = { ...native };

      return Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        const legacy = yield* StorageReader;
        const read = storage.getUrl(storageId);

        expectTypeOf(read).toEqualTypeOf<
          Effect.Effect<URL, BlobNotFoundError>
        >();
        expect(native.getUrl).not.toHaveBeenCalled();
        expect((yield* read).href).toBe(blobUrl);
        native.getUrl.mockResolvedValueOnce(`${blobUrl}/fresh`);
        expect((yield* read).href).toBe(`${blobUrl}/fresh`);
        expect((yield* legacy.getUrl(storageId)).href).toBe(blobUrl);
        expect(native.getUrl.mock.calls).toEqual([
          [storageId],
          [storageId],
          [storageId],
        ]);
        expect(native.getUrl.mock.contexts).toEqual([native, native, native]);
        expect(native).toEqual(original);
        expect(native.generateUploadUrl).not.toHaveBeenCalled();
      }).pipe(Effect.provide(Storage.layer(native)));
    },
  );

  it.effect("defers writer lookup until each operation executes", () => {
    const reader = makeNativeStorage();
    const first = makeNativeStorage();
    const second = makeNativeStorage();
    second.generateUploadUrl.mockResolvedValue(`${uploadUrl}/second`);

    return Effect.gen(function* () {
      const storage = yield* Storage.Storage;
      const upload = storage.generateUploadUrl;
      const remove = storage.delete(storageId);

      expectTypeOf(upload).toEqualTypeOf<
        Effect.Effect<URL, never, StorageWriter>
      >();
      expectTypeOf(remove).toEqualTypeOf<
        Effect.Effect<void, BlobNotFoundError, StorageWriter>
      >();
      expect(first.generateUploadUrl).not.toHaveBeenCalled();
      expect(first.delete).not.toHaveBeenCalled();
      expect(
        (yield* upload.pipe(Effect.provide(StorageWriter.layer(first)))).href,
      ).toBe(uploadUrl);
      expect(
        (yield* upload.pipe(Effect.provide(StorageWriter.layer(second)))).href,
      ).toBe(`${uploadUrl}/second`);
      yield* remove.pipe(Effect.provide(StorageWriter.layer(first)));
      yield* remove.pipe(Effect.provide(StorageWriter.layer(second)));
      expect(first.generateUploadUrl.mock.contexts).toEqual([first]);
      expect(second.generateUploadUrl.mock.contexts).toEqual([second]);
      expect(first.delete).toHaveBeenCalledExactlyOnceWith(storageId);
      expect(second.delete).toHaveBeenCalledExactlyOnceWith(storageId);
      expect(first.delete.mock.contexts).toEqual([first]);
      expect(reader.generateUploadUrl).not.toHaveBeenCalled();
      expect(reader.delete).not.toHaveBeenCalled();
    }).pipe(Effect.provide(Storage.layer(reader)));
  });

  it.effect(
    "defers action capabilities and preserves blob and option identities",
    () => {
      const reader = makeNativeStorage();
      const first = makeNativeStorage();
      const second = makeNativeStorage();
      const blob = new Blob(["input"], { type: "text/plain" });
      const options = { sha256: "digest" };
      const firstBlob = new Blob(["first"]);
      const secondBlob = new Blob(["second"]);
      first.get.mockResolvedValue(firstBlob);
      second.get.mockResolvedValue(secondBlob);

      return Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        const get = storage.get(storageId);
        const store = storage.store(blob, options);
        const storeWithoutOptions = storage.store(blob);

        expectTypeOf(get).toEqualTypeOf<
          Effect.Effect<Blob, BlobNotFoundError, StorageActionWriter>
        >();
        expectTypeOf(store).toEqualTypeOf<
          Effect.Effect<GenericId<"_storage">, never, StorageActionWriter>
        >();
        expect(first.get).not.toHaveBeenCalled();
        expect(first.store).not.toHaveBeenCalled();
        expect(
          yield* get.pipe(Effect.provide(StorageActionWriter.layer(first))),
        ).toBe(firstBlob);
        expect(
          yield* get.pipe(Effect.provide(StorageActionWriter.layer(second))),
        ).toBe(secondBlob);
        expect(
          yield* store.pipe(Effect.provide(StorageActionWriter.layer(first))),
        ).toBe(storageId);
        expect(
          yield* store.pipe(Effect.provide(StorageActionWriter.layer(second))),
        ).toBe(storageId);
        yield* storeWithoutOptions.pipe(
          Effect.provide(StorageActionWriter.layer(first)),
        );
        expect(first.store.mock.calls).toEqual([
          [blob, options],
          [blob, undefined],
        ]);
        expect(first.store.mock.calls[0]?.[0]).toBe(blob);
        expect(first.store.mock.calls[0]?.[1]).toBe(options);
        expect(second.store).toHaveBeenCalledExactlyOnceWith(blob, options);
        expect(first.get.mock.contexts).toEqual([first]);
        expect(first.store.mock.contexts).toEqual([first, first]);
        expect(options).toEqual({ sha256: "digest" });
        expect(yield* Effect.promise(() => blob.text())).toBe("input");
        expect(blob.type).toBe("text/plain");
        expect(reader.get).not.toHaveBeenCalled();
        expect(reader.store).not.toHaveBeenCalled();
      }).pipe(Effect.provide(Storage.layer(reader)));
    },
  );

  it.effect(
    "maps missing URLs, missing blobs, and rejected deletes to the requested ID",
    () => {
      const native = makeNativeStorage();
      native.getUrl.mockResolvedValue(null);
      native.get.mockResolvedValue(null);
      native.delete.mockRejectedValue(new Error("missing"));

      return Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        const operations: ReadonlyArray<
          Effect.Effect<
            URL | Blob | void,
            BlobNotFoundError,
            StorageWriter | StorageActionWriter
          >
        > = [
          storage.getUrl(storageId),
          storage.get(storageId),
          storage.delete(storageId),
        ];
        for (const operation of operations) {
          const error = yield* Effect.flip(operation);
          expect(error).toBeInstanceOf(BlobNotFoundError);
          expect(error.id).toBe(storageId);
        }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Storage.layer(native),
            StorageWriter.layer(native),
            StorageActionWriter.layer(native),
          ),
        ),
      );
    },
  );

  it.effect(
    "preserves unexpected read, upload, get, and store failures as defects",
    () => {
      const native = makeNativeStorage();
      const failure = new Error("native failure");
      native.getUrl.mockRejectedValue(failure);
      native.generateUploadUrl.mockRejectedValue(failure);
      native.get.mockRejectedValue(failure);
      native.store.mockRejectedValue(failure);

      return Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        const operations: ReadonlyArray<
          Effect.Effect<
            unknown,
            BlobNotFoundError,
            StorageWriter | StorageActionWriter
          >
        > = [
          storage.getUrl(storageId),
          storage.generateUploadUrl,
          storage.get(storageId),
          storage.store(new Blob()),
        ];
        for (const operation of operations) {
          expect(yield* Effect.exit(operation)).toEqual(Exit.die(failure));
        }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Storage.layer(native),
            StorageWriter.layer(native),
            StorageActionWriter.layer(native),
          ),
        ),
      );
    },
  );

  it.effect("treats malformed native URL strings as schema defects", () => {
    const native = makeNativeStorage();
    native.getUrl.mockResolvedValue("not a URL");
    native.generateUploadUrl.mockResolvedValue("not a URL");

    return Effect.gen(function* () {
      const storage = yield* Storage.Storage;
      for (const operation of [
        storage.getUrl(storageId),
        storage.generateUploadUrl,
      ]) {
        const exit = yield* Effect.exit(operation);
        expect(exit).toEqual(Exit.die(expect.any(Schema.SchemaError)));
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(Storage.layer(native), StorageWriter.layer(native)),
      ),
    );
  });
});
