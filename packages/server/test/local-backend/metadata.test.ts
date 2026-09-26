import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "context metadata",
  (it) => {
    it.effect("provides execution metadata and metrics in queries", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const metadata = yield* Ref.runWithCodec(
          refs.public.groups.metadata.queryMetadata,
          {},
          (ref, args) => client.query(ref, args),
        );

        expect(metadata.functionName).toBe("groups/metadata:queryMetadata");
        expect(metadata.functionType).toBe("query");
        expect(metadata.deploymentName).not.toBe("");
        expect(metadata.remainingReads).toBeGreaterThan(0);
      }),
    );

    it.effect("provides all three services in mutations", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const metadata = yield* Ref.runWithCodec(
          refs.public.groups.metadata.mutationMetadata,
          {},
          (ref, args) => client.mutation(ref, args),
        );

        expect(metadata.functionName).toBe("groups/metadata:mutationMetadata");
        expect(metadata.functionType).toBe("mutation");
        expect(metadata.deploymentName).not.toBe("");
        expect(metadata.requestId).not.toBe("");
        expect(metadata.remainingWrites).toBeGreaterThan(0);
      }),
    );

    it.effect("binds action metadata to each invocation", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const invoke = Ref.runWithCodec(
          refs.public.groups.metadata.actionMetadata,
          {},
          (ref, args) => client.action(ref, args),
        );
        const first = yield* invoke;
        const second = yield* invoke;

        expect(first.functionName).toBe("groups/metadata:actionMetadata");
        expect(first.functionType).toBe("action");
        expect(first.deploymentName).not.toBe("");
        expect(first.requestId).not.toBe("");
        expect(first.requestId).not.toBe(second.requestId);
      }),
    );

    it.effect("provides metadata in Node actions", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const metadata = yield* Ref.runWithCodec(
          refs.public.metadataNode.metadata,
          {},
          (ref, args) => client.action(ref, args),
        );

        expect(metadata.functionName).toBe("metadataNode:metadata");
        expect(metadata.functionType).toBe("action");
        expect(metadata.deploymentName).not.toBe("");
        expect(metadata.requestId).not.toBe("");
      }),
    );

    it.effect("provides metadata in HTTP handlers", () =>
      Effect.gen(function* () {
        yield* LocalBackend.LocalBackend;
        const response = yield* HttpClient.get(
          "http://127.0.0.1:3211/context-metadata",
        );

        expect(response.status).toBe(200);
        expect(yield* response.json).toEqual({
          functionName: expect.any(String),
          deploymentName: expect.any(String),
          requestId: expect.any(String),
        });
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );
  },
);
