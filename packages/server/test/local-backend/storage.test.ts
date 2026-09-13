/**
 * End-to-end test of Confect's storage services inside Convex's real UDF
 * isolate. Convex returns storage URLs as plain strings, which the storage
 * services decode with Effect's `Schema.URLFromString`—so these only pass if
 * that string→URL decode succeeds in the isolate.
 */

import { Ref } from "@confect/core";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { expect, layer } from "@effect/vitest";
import { GenericId } from "@confect/core/GenericId";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

const UploadResponse = Schema.fromJsonString(
  Schema.Struct({ storageId: GenericId("_storage") }),
);

layer(Layer.mergeAll(LocalBackend.layer, NodeHttpClient.layerUndici), {
  timeout: "120 seconds",
})("Storage services inside the Convex isolate", (it) => {
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
            { storageId },
          ),
        );

        expect(new URL(blobUrl).pathname).toContain("/api/storage/");
      }),
    60_000,
  );
});
