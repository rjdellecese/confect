import { describe } from "@effect/vitest";
import {
  assertEquals,
  assertFailure,
  assertInstanceOf,
} from "@effect/vitest/utils";
import { Cause, Effect, Runtime, Schema } from "effect";
import { api } from "~/test/convex/_generated/api";
import { test } from "~/test/convex-effect-test";
import { TestConvexService } from "~/test/test-convex-service";
import { FileNotFoundError } from "../../../src/server/storage";

describe("ConfectStorageReader", () => {
  describe("getUrl", () => {
    test("when file exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        const urlString = yield* c.action(
          api.integration.storage.confectStorageReaderGetUrl,
          {
            id,
          },
        );
        const url = yield* Schema.decode(Schema.URL)(urlString);

        assertInstanceOf(url, URL);
      }));

    test("when file no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        yield* c.run(({ storage }) => storage.delete(id));

        const exit = yield* c
          .action(api.integration.storage.confectStorageReaderGetUrl, {
            id,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(Cause.fail(new FileNotFoundError({ id }))),
          ),
        );
      }));
  });
});

describe("ConfectStorageWriter", () => {
  test("generateUploadUrl", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const urlString = yield* c.action(
        api.integration.storage.confectStorageWriterGenerateUploadUrl,
      );
      const url = yield* Schema.decode(Schema.URL)(urlString);

      assertInstanceOf(url, URL);
    }));

  describe("delete", () => {
    test("when file exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        yield* c.action(api.integration.storage.confectStorageWriterDelete, {
          id,
        });

        const storageDoc = yield* c.run(({ storage }) => storage.get(id));

        assertEquals(storageDoc, null);
      }));

    test("when file no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        yield* c.run(({ storage }) => storage.delete(id));

        const exit = yield* c
          .action(api.integration.storage.confectStorageWriterDelete, {
            id,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(Cause.fail(new FileNotFoundError({ id }))),
          ),
        );
      }));
  });
});

describe("StorageActionWriter", () => {
  describe("get", () => {
    test("when file exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const blob = new Blob();
        const id = yield* c.run(({ storage }) => storage.store(blob));

        const blobSize = yield* c.action(
          api.integration.storage.confectStorageActionWriterGet,
          {
            id,
          },
        );

        assertEquals(blobSize, blob.size);
      }));

    test("when file no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const blob = new Blob();

        const id = yield* c.run(({ storage }) => storage.store(blob));
        yield* c.run(({ storage }) => storage.delete(id));

        const exit = yield* c
          .action(api.integration.storage.confectStorageActionWriterGet, {
            id,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(Cause.fail(new FileNotFoundError({ id }))),
          ),
        );
      }));
  });

  test("store", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      const id = yield* c.action(
        api.integration.storage.confectStorageActionWriterStore,
        {
          text,
        },
      );

      const blobText = yield* c.run(({ storage }) =>
        storage
          .get(id)
          .then((blob) => (blob ? blob.text() : Promise.resolve(null))),
      );

      assertEquals(blobText, text);
    }));
});
