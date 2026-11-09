/**
 * End-to-end test of Confect's storage services inside Convex's real UDF
 * isolate. Convex returns storage URLs as plain strings, which the storage
 * services decode with Effect's `Schema.URLFromString`—so these only pass if
 * that string→URL decode succeeds in the isolate.
 */

import { Ref } from "@confect/core";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { expect, layer } from "@effect/vitest";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import refs from "confect-local-backend/refs";
import * as LocalBackend from "confect-local-backend/LocalBackend";

const UploadResponse = Schema.fromJsonString(
  Schema.Struct({ storageId: Schema.String }),
);

layer(Layer.mergeAll(LocalBackend.layer, NodeHttpClient.layerUndici), {
  timeout: "120 seconds",
})("Storage services inside the Convex isolate", (it) => {
  it.effect(
    "stores and reads Blobs in mutations with MIME and SHA256 validation",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const storage = refs.public.groups.storage;
        for (const type of ["text/plain;charset=utf-8", ""]) {
          const stored = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.storeMutation), {
              text: "abc",
              type,
              sha256: "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
            }),
          );
          expect(stored).toEqual({
            storageId: expect.any(String),
            text: "abc",
            type,
            size: 3,
          });
          const read = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.getMutation), {
              storageId: stored.storageId,
            }),
          );
          expect(read).toEqual(stored);
          const actionRead = yield* Effect.promise(() =>
            client.action(Ref.getFunctionReference(storage.get), {
              storageId: stored.storageId,
            }),
          );
          expect(actionRead).toBe("abc");
          const deleted = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.deleteAndGet), {
              storageId: stored.storageId,
            }),
          );
          expect(deleted).toEqual({
            id: stored.storageId,
            tag: "BlobNotFoundError",
          });
          yield* Effect.promise(() =>
            expect(
              client.mutation(Ref.getFunctionReference(storage.getMutation), {
                storageId: stored.storageId,
              }),
            ).rejects.toThrow(/BlobNotFoundError/),
          );
          const missing = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.limitedFiles), {
              storageIds: [stored.storageId],
              sizes: [],
              limits: {
                filesRead: 0,
                fileReadBytes: 0,
                filesWritten: 0,
                fileWriteBytes: 0,
              },
            }),
          );
          expect(missing.failures).toHaveLength(1);
          expect(missing.failures[0]).toContain("BlobNotFoundError");
          expect(missing.metrics).toEqual({
            filesRead: 0,
            fileReadBytes: 0,
            filesWritten: 0,
            fileWriteBytes: 0,
          });
        }
        yield* Effect.promise(() =>
          expect(
            client.mutation(Ref.getFunctionReference(storage.storeMutation), {
              text: "abc",
              type: "text/plain",
              sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            }),
          ).rejects.toThrow(/sha256 mismatch/i),
        );
      }),
  );

  it.effect(
    "restores the parent's pending file after nested rollback and retains read usage",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const storage = refs.public.groups.storage;
        const readId = yield* Effect.promise(() =>
          client.action(Ref.getFunctionReference(storage.store), {
            text: "existing",
          }),
        );
        const result = yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(storage.rollback), {
            readId,
          }),
        );
        expect(result.metrics).toEqual({
          filesRead: 1,
          fileReadBytes: 8,
          filesWritten: 1,
          fileWriteBytes: 6,
        });
        for (const [storageId, text] of [
          [readId, "existing"],
          [result.parentId, "parent"],
        ] as const) {
          const blob = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.getMutation), {
              storageId,
            }),
          );
          expect(blob.text).toBe(text);
        }
        yield* Effect.promise(() =>
          expect(
            client.mutation(Ref.getFunctionReference(storage.getMutation), {
              storageId: result.rolledBackId,
            }),
          ).rejects.toThrow(/BlobNotFoundError/),
        );
        yield* Effect.promise(() =>
          expect(
            client.query(Ref.getFunctionReference(storage.getUrl), {
              storageId: result.rolledBackId,
            }),
          ).rejects.toThrow(/BlobNotFoundError/),
        );
      }),
  );

  it.effect(
    "hides pending storage metadata from stale snapshots without hiding the Blob from its mutation",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const storage = refs.public.groups.storage;
        for (const stale of [false, true]) {
          const result = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.staleRead), {
              stale,
            }),
          );
          expect(result.text).toBe("pending");
          if (stale) expect(result.url).toBeNull();
          else expect(result.url).toContain("/api/storage/");
          const committed = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.getMutation), {
              storageId: result.storageId,
            }),
          );
          expect(committed.text).toBe("pending");
        }
      }),
  );

  it.effect.each([
    {
      filesWritten: 1,
      fileWriteBytes: 100,
      sizes: [3, 1, 1],
      written: 1,
      bytes: 3,
      error: /Too many files stored/i,
    },
    {
      filesWritten: 10,
      fileWriteBytes: 4,
      sizes: [3, 2, 2, 1],
      written: 2,
      bytes: 4,
      error: /Too large total size of the files stored/i,
    },
  ])(
    "enforces nested file write limits without charging caught failures: $filesWritten files, $fileWriteBytes bytes",
    ({ filesWritten, fileWriteBytes, sizes, written, bytes, error }) =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const storage = refs.public.groups.storage;
        const result = yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(storage.limitedFiles), {
            sizes,
            storageIds: [],
            limits: {
              filesRead: 0,
              fileReadBytes: 0,
              filesWritten,
              fileWriteBytes,
            },
          }),
        );
        expect(result.failures).toHaveLength(2);
        for (const failure of result.failures) expect(failure).toMatch(error);
        expect(result.storageIds).toHaveLength(written);
        expect(result.metrics).toEqual({
          filesRead: 0,
          fileReadBytes: 0,
          filesWritten: written,
          fileWriteBytes: bytes,
        });
        let committedBytes = 0;
        for (const storageId of result.storageIds) {
          const blob = yield* Effect.promise(() =>
            client.mutation(Ref.getFunctionReference(storage.getMutation), {
              storageId,
            }),
          );
          committedBytes += blob.size;
        }
        expect(committedBytes).toBe(bytes);
      }),
  );

  it.effect.each([
    { filesRead: 1, fileReadBytes: 100, error: /Too many files read/i },
    {
      filesRead: 10,
      fileReadBytes: 4,
      error: /Too large total size of the files read/i,
    },
  ])(
    "counts distinct reads and rejects repeated over-budget reads: $filesRead files, $fileReadBytes bytes",
    ({ filesRead, fileReadBytes, error }) =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const storage = refs.public.groups.storage;
        const first = yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(storage.storeMutation), {
            text: "abcd",
            type: "text/plain",
          }),
        );
        const second = yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(storage.storeMutation), {
            text: "e",
            type: "text/plain",
          }),
        );
        const result = yield* Effect.promise(() =>
          client.mutation(Ref.getFunctionReference(storage.limitedFiles), {
            sizes: [],
            storageIds: [
              first.storageId,
              first.storageId,
              second.storageId,
              second.storageId,
            ],
            limits: {
              filesRead,
              fileReadBytes,
              filesWritten: 0,
              fileWriteBytes: 0,
            },
          }),
        );
        expect(result.failures).toHaveLength(2);
        for (const failure of result.failures) expect(failure).toMatch(error);
        expect(result.metrics).toEqual({
          filesRead: 1,
          fileReadBytes: 4,
          filesWritten: 0,
          fileWriteBytes: 0,
        });
      }),
  );

  it.effect("shares stored blobs across actions, queries, and mutations", () =>
    Effect.gen(function* () {
      const { client } = yield* LocalBackend.LocalBackend;
      const storage = refs.public.groups.storage;
      const text = "stored through the unified service";
      const storageId = yield* Effect.promise(() =>
        client.action(Ref.getFunctionReference(storage.store), { text }),
      );
      const contents = yield* Effect.promise(() =>
        client.action(Ref.getFunctionReference(storage.get), { storageId }),
      );
      expect(contents).toBe(text);
      const url = yield* Effect.promise(() =>
        client.query(Ref.getFunctionReference(storage.getUrl), { storageId }),
      );
      expect(new URL(url).pathname).toContain("/api/storage/");
      const pipeResult = yield* HttpClient.get(url).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.text),
      );
      expect(pipeResult).toBe(text);
      const promiseResult = yield* Effect.promise(() =>
        client.mutation(Ref.getFunctionReference(storage.deleteBlob), {
          storageId,
        }),
      );
      expect(promiseResult).toBeNull();
      yield* Effect.promise(() =>
        expect(
          client.query(Ref.getFunctionReference(storage.getUrl), { storageId }),
        ).rejects.toThrow(/BlobNotFoundError/),
      );
      yield* Effect.promise(() =>
        expect(
          client.action(Ref.getFunctionReference(storage.get), { storageId }),
        ).rejects.toThrow(/BlobNotFoundError/),
      );
    }),
  );

  it.effect(
    "generateUploadUrl decodes the isolate's string URL, and getUrl resolves an uploaded blob",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;

        const uploadUrl = yield* Effect.promise(() =>
          client.mutation(
            Ref.getFunctionReference(
              refs.public.groups.storage.generateUploadUrl,
            ),
            {},
          ),
        );
        expect(new URL(uploadUrl).pathname).toContain("/api/storage/upload");

        const uploadResponseBody = yield* HttpClient.post(uploadUrl, {
          body: HttpBody.text("hello, storage"),
          headers: { "Content-Type": "text/plain" },
        }).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.text),
        );
        const { storageId } =
          yield* Schema.decodeEffect(UploadResponse)(uploadResponseBody);

        const blobUrl = yield* Effect.promise(() =>
          client.query(
            Ref.getFunctionReference(refs.public.groups.storage.getUrl),
            { storageId: storageId as GenericId<"_storage"> },
          ),
        );
        expect(new URL(blobUrl).pathname).toContain("/api/storage/");
      }),
    60_000,
  );
});
