import { describe } from "@effect/vitest";
import {
  assertEquals,
  assertFailure,
  assertInstanceOf,
} from "@effect/vitest/utils";
import { Cause, Effect, Runtime, Schema } from "effect";
import { FileNotFoundError } from "../src/server/storage";
import { api } from "./convex/_generated/api";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("ConfectStorageReader", () => {
  describe("getUrl", () => {
    effect("when file exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        const urlString = yield* c.action(
          api.storage.confectStorageReaderGetUrl,
          {
            id,
          },
        );
        const url = yield* Schema.decode(Schema.URL)(urlString);

        assertInstanceOf(url, URL);
      }),
    );

    effect("when file no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        yield* c.run(({ storage }) => storage.delete(id));

        const exit = yield* c
          .action(api.storage.confectStorageReaderGetUrl, {
            id,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(Cause.fail(new FileNotFoundError({ id }))),
          ),
        );
      }),
    );
  });
});

describe("ConfectStorageWriter", () => {
  effect("generateUploadUrl", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const urlString = yield* c.action(
        api.storage.confectStorageWriterGenerateUploadUrl,
      );
      const url = yield* Schema.decode(Schema.URL)(urlString);

      assertInstanceOf(url, URL);
    }),
  );

  describe("delete", () => {
    effect("when file exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        yield* c.action(api.storage.confectStorageWriterDelete, {
          id,
        });

        const storageDoc = yield* c.run(({ storage }) => storage.get(id));

        assertEquals(storageDoc, null);
      }),
    );

    effect("when file no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const id = yield* c.run(({ storage }) => storage.store(new Blob()));
        yield* c.run(({ storage }) => storage.delete(id));

        const exit = yield* c
          .action(api.storage.confectStorageWriterDelete, {
            id,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(Cause.fail(new FileNotFoundError({ id }))),
          ),
        );
      }),
    );
  });
});

describe("ConfectStorageActionWriter", () => {
  describe("get", () => {
    effect("when file exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const blob = new Blob();
        const id = yield* c.run(({ storage }) => storage.store(blob));

        const blobSize = yield* c.action(
          api.storage.confectStorageActionWriterGet,
          {
            id,
          },
        );

        assertEquals(blobSize, blob.size);
      }),
    );

    effect("when file no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const blob = new Blob();

        const id = yield* c.run(({ storage }) => storage.store(blob));
        yield* c.run(({ storage }) => storage.delete(id));

        const exit = yield* c
          .action(api.storage.confectStorageActionWriterGet, {
            id,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(Cause.fail(new FileNotFoundError({ id }))),
          ),
        );
      }),
    );
  });

  effect("store", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      const id = yield* c.action(api.storage.confectStorageActionWriterStore, {
        text,
      });

      const blobText = yield* c.run(({ storage }) =>
        storage
          .get(id)
          .then((blob) => (blob ? blob.text() : Promise.resolve(null))),
      );

      assertEquals(blobText, text);
    }),
  );
});
