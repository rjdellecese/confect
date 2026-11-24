import type { Ref } from "@confect/core";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { expect, expectTypeOf, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import type {
  first,
  second,
  left,
  right,
} from "confect-local-backend/componentBindings";
import { api } from "confect-local-backend/api";
import * as LocalBackend from "confect-local-backend/LocalBackend";

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
expectTypeOf<
  Ref.Returns<typeof first.counter.paginate>["page"][number]["_id"]
>().toEqualTypeOf<Ref.Returns<typeof first.counter.create>>();
expectTypeOf<
  Ref.Returns<typeof first.counter.paginate>["page"][number]["_id"]
>().not.toExtend<Ref.Returns<typeof second.counter.create>>();
expectTypeOf<
  Ref.Returns<typeof first.counter.paginate>["page"][number]["count"]
>().toEqualTypeOf<number>();

layer(Layer.mergeAll(LocalBackend.layer, NodeHttpClient.layerUndici), {
  timeout: "120 seconds",
  // Scheduled functions run on the real backend's clock.
  excludeTestServices: true,
})("Confect-authored components on a real backend", (it) => {
  it.effect(
    "paginates component tables through native and decoded calls with isolated mounts",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const random = yield* Random.next;
        const run = String(random);
        const ids = yield* Effect.promise(() =>
          client.mutation(api.groups.components.seedPagination, { run }),
        );
        const firstPage = yield* Effect.promise(() =>
          client.query(api.groups.components.paginate, {
            run,
            paginationOpts: { numItems: 2, cursor: null },
          }),
        );
        expect(firstPage.page).toEqual([
          { id: ids.first[0], count: 2 },
          { id: ids.first[1], count: 3 },
        ]);
        expect(firstPage.isDone).toBe(false);
        expect(firstPage.continueCursor).toEqual(expect.any(String));
        const lastPage = yield* Effect.promise(() =>
          client.query(api.groups.components.paginate, {
            run,
            paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
          }),
        );
        expect(lastPage.page).toEqual([{ id: ids.first[2], count: 5 }]);
        expect(lastPage.isDone).toBe(true);

        const nativeFirst = yield* Effect.promise(() =>
          client.query(api.groups.nativeComponents.paginate, {
            run,
            second: false,
            paginationOpts: { numItems: 2, cursor: null },
          }),
        );
        expect(
          Array.map(nativeFirst.page, (doc) => [doc._id, doc.count]),
        ).toEqual([
          [ids.first[0], "2"],
          [ids.first[1], "3"],
        ]);
        expect(nativeFirst.isDone).toBe(false);
        const nativeLast = yield* Effect.promise(() =>
          client.query(api.groups.nativeComponents.paginate, {
            run,
            second: false,
            paginationOpts: { numItems: 2, cursor: nativeFirst.continueCursor },
          }),
        );
        expect(
          Array.map(nativeLast.page, (doc) => [doc._id, doc.count]),
        ).toEqual([[ids.first[2], "5"]]);
        expect(nativeLast.isDone).toBe(true);
        const otherMount = yield* Effect.promise(() =>
          client.query(api.groups.nativeComponents.paginate, {
            run,
            second: true,
            paginationOpts: { numItems: 2, cursor: null },
          }),
        );
        expect(Array.map(otherMount.page, (doc) => doc.count)).toEqual(["99"]);
        expect(otherMount.isDone).toBe(true);
      }),
  );

  it.effect(
    "enforces one native pagination call across component runQuery calls",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const random = yield* Random.next;
        const run = String(random);
        yield* Effect.promise(() =>
          expect(
            client.query(api.groups.nativeComponents.paginateTwice, {
              run,
              paginationOpts: { numItems: 2, cursor: null },
            }),
          ).rejects.toThrow(
            "This query function ran multiple paginated queries",
          ),
        );
      }),
  );

  it.effect(
    "supports vanilla wire calls, decoded Confect calls, nested isolation, and typed-error rollback",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const random = yield* Random.next;
        const run = String(random);
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
        const random = yield* Random.next;
        const run = String(random);
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
        const hasAuth = yield* Effect.promise(() =>
          client.query(api.groups.components.hasAuth, {}),
        );
        expect(hasAuth).toBe(false);
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
