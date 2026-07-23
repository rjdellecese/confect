/**
 * End-to-end test of Confect's storage services inside Convex's real UDF
 * isolate. Convex returns storage URLs as plain strings, and the isolate's
 * `URL` polyfill lacks the static `URL.canParse` that Effect's
 * `Schema.URLFromString` decode relies on — so these only pass if the
 * `URL.canParse` polyfill `@confect/server` installs takes effect in the
 * isolate and the string→URL decode succeeds there.
 */

import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

const UploadResponse = Schema.fromJsonString(
  Schema.Struct({ storageId: Schema.String }),
);

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "Storage services inside the Convex isolate",
  (it) => {
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

          const uploadResponseBody = yield* Effect.promise(() =>
            fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: "hello, storage",
            }).then((response) => response.text()),
          );
          const { storageId } =
            yield* Schema.decodeUnknownEffect(UploadResponse)(
              uploadResponseBody,
            );

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
  },
);
