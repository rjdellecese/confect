import type { Ref } from "@confect/core";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type {
  first,
  second,
  left,
  right,
} from "./fixtures/confect/componentBindings";
import { api } from "./fixtures/convex/_generated/api";
import * as LocalBackend from "./LocalBackend";

// These identities come from Convex's generated ComponentApi<MountName>,
// including the nested child's scope carried by the parent's contract.
expectTypeOf<Ref.Returns<typeof first.counter.create>>().not.toExtend<
  Ref.Returns<typeof second.counter.create>
>();
expectTypeOf<Ref.Returns<typeof left.parent.create>>().not.toExtend<
  Ref.Returns<typeof right.parent.create>
>();
expectTypeOf<Ref.Returns<typeof first.counter.create>>().not.toExtend<
  Ref.Returns<typeof left.parent.create>
>();

layer(Layer.mergeAll(LocalBackend.layer, NodeHttpClient.layerUndici), {
  timeout: "120 seconds",
  // Scheduled functions run on the real backend's clock.
  excludeTestServices: true,
})("Confect-authored components on a real backend", (it) => {
  it.effect(
    "supports vanilla wire calls, decoded Confect calls, nested isolation, and typed-error rollback",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const run = String(yield* Random.next);
        const native = yield* Effect.promise(() =>
          client.mutation(api.groups.nativeComponents.roundTrip, { run }),
        );
        expect(native.docs).toEqual([
          {
            _id: native.id,
            _creationTime: expect.any(Number),
            run,
            count: "2",
          },
        ]);
        const result = yield* Effect.promise(() =>
          client.mutation(api.groups.components.exercise, { run }),
        );
        expect(result).toEqual({
          first: [2],
          second: [7],
          left: [11],
          right: [13],
          rejectedId: expect.any(String),
        });
      }),
  );

  it.effect(
    "schedules an encoded mutation only in the originating installation",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const run = String(yield* Random.next);
        const id = yield* Effect.promise(() =>
          client.mutation(api.groups.components.schedule, { run }),
        );
        expect(id).toEqual(expect.any(String));
        yield* Effect.promise(() =>
          client.query(api.groups.components.list, { run }),
        ).pipe(
          Effect.repeat({
            schedule: Schedule.spaced("100 millis"),
            until: (result) => result.first.length > 0,
          }),
          Effect.timeout("10 seconds"),
        );
        const result = yield* Effect.promise(() =>
          client.query(api.groups.components.list, { run }),
        );
        expect(result).toEqual({ first: [17], second: [] });
      }),
  );

  it.effect("uses component-scoped storage across the host boundary", () =>
    Effect.gen(function* () {
      const { client } = yield* LocalBackend.LocalBackend;
      const uploadUrl = yield* Effect.promise(() =>
        client.mutation(api.groups.components.uploadUrl, {}),
      );
      const uploadResponse = yield* HttpClient.post(uploadUrl, {
        body: HttpBody.text("component storage"),
      }).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
      const { storageId } = yield* HttpClientResponse.schemaBodyJson(
        Schema.Struct({ storageId: Schema.String }),
      )(uploadResponse);
      const url = yield* Effect.promise(() =>
        client.query(api.groups.components.storageUrl, { id: storageId }),
      );
      const body = yield* HttpClient.get(url).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.text),
      );
      expect(body).toBe("component storage");
    }),
  );

  it.effect(
    "mounts component HTTP routes and omits application auth from component contexts",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        expect(
          yield* Effect.promise(() =>
            client.query(api.groups.components.hasAuth, {}),
          ),
        ).toBe(false);
        for (const mount of ["first", "second", "left/child", "right/child"]) {
          const body = yield* HttpClient.get(
            `http://127.0.0.1:3211/${mount}/health`,
          ).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap((response) => response.text),
          );
          expect(body).toBe("component-ready");
          const echo = yield* HttpClient.post(
            `http://127.0.0.1:3211/${mount}/echo`,
            {
              body: HttpBody.text(`body for ${mount}`),
            },
          ).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap((response) => response.text),
          );
          expect(echo).toBe(`body for ${mount}`);
          const missing = yield* HttpClient.get(
            `http://127.0.0.1:3211/${mount}/missing`,
          );
          expect(missing.status).toBe(404);
        }
      }),
  );
});
