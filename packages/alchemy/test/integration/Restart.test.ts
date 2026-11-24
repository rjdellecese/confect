import { Convex } from "@confect/alchemy";
import * as Api from "@confect/alchemy/ConvexClient";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { it, expect } from "@effect/vitest";
import { adopt } from "alchemy/AdoptPolicy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import {
  localState,
  State,
  InMemoryService,
  StateStoreError,
} from "alchemy/State";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Redacted from "effect/Redacted";
import { failureOf, stackFixture } from "./StackFixture.js";

const target = { name: "disk-7", url: "https://disk-7.eu-west-1.convex.cloud" };
const oldKey = Redacted.make("opaque-credential-one");
const newKey = Redacted.make("opaque-credential-two");
const storeDir = Effect.gen(function* () {
  const ctx = yield* Layer.build(NodeFileSystem.layer);
  const fs = Context.get(ctx, FileSystem);
  return yield* fs.makeTempDirectoryScoped();
});
const reopen = (dir: string, client: Layer.Layer<Api.ConvexClient>) =>
  stackFixture({
    client,
    state: localState().pipe(
      Layer.provide(
        Layer.succeed(AlchemyContext, {
          dotAlchemy: dir,
          dev: false,
          adopt: false,
        }),
      ),
    ),
  });
const writer = (key: Redacted.Redacted<string>) =>
  Convex.AuthoritativeEnvironmentVariable("Write", {
    deployment: target,
    deployKey: key,
    name: "SECRET",
    value: Redacted.make("new-value"),
  }).pipe(RemovalPolicy.destroy(), Effect.asVoid);

it.effect(
  "only unsets possibly-applied first writes after recreating every service from disk",
  () =>
    Effect.gen(function* () {
      for (const status of [401, 403, 503]) {
        const dir = yield* storeDir;
        let unsets = 0;
        const api = () =>
          Layer.mock(Api.ConvexClient)({
            updateEnvironmentVariables: (_url, key, changes) =>
              Effect.gen(function* () {
                expect(Redacted.value(key)).toBe(Redacted.value(oldKey));
                if (changes[0].value !== undefined)
                  return yield* Api.ConvexApiError.make({
                    operation: "updateEnvironmentVariables",
                    status,
                    code: "HttpError",
                  });
                unsets++;
              }),
          });
        const failed = yield* failureOf(
          reopen(dir, api()).deploy(writer(oldKey)),
        );
        expect(failed).toContain("HttpError");
        yield* reopen(dir, api()).deploy(Effect.void);
        expect(unsets).toBe(status === 503 ? 1 : 0);
      }
    }),
);

it.effect(
  "after a rejected key change, a new engine restores the borrowed values or unsets the writer using the last valid key",
  () =>
    Effect.gen(function* () {
      for (const kind of ["map", "writer"]) {
        const dir = yield* storeDir;
        let value: string | undefined = "old";
        let cleanupKey: string | undefined;
        const api = () =>
          Layer.mock(Api.ConvexClient)({
            listEnvironmentVariables: () =>
              Effect.succeed<Api.EnvironmentVariables>(
                value === undefined ? {} : { SECRET: Redacted.make(value) },
              ),
            updateEnvironmentVariables: (_url, key, changes) =>
              Effect.gen(function* () {
                if (Redacted.value(key) === Redacted.value(newKey))
                  return yield* Api.ConvexApiError.make({
                    operation: "updateEnvironmentVariables",
                    status: 403,
                    code: "HttpError",
                  });
                const entry = changes[0].value;
                value =
                  entry == null
                    ? undefined
                    : typeof entry === "string"
                      ? entry
                      : Redacted.value(entry);
                if (value === "old" || value === undefined)
                  cleanupKey = Redacted.value(key);
              }),
          });
        const declare = (key: Redacted.Redacted<string>) =>
          kind === "writer"
            ? writer(key)
            : Convex.EnvironmentVariables("Borrow", {
                url: target.url,
                deployKey: key,
                variables: {
                  SECRET:
                    Redacted.value(key) === Redacted.value(oldKey)
                      ? "initial"
                      : "different",
                },
              }).pipe(adopt(), Effect.asVoid);
        yield* reopen(dir, api()).deploy(declare(oldKey));
        const failed = yield* failureOf(
          reopen(dir, api()).deploy(declare(newKey)),
        );
        expect(failed).toContain("HttpError");
        yield* reopen(dir, api()).deploy(Effect.void);
        expect(value).toBe(kind === "map" ? "old" : undefined);
        expect(cleanupKey).toBe(Redacted.value(oldKey));
      }
    }),
);

it.effect(
  "persists pre-write originals despite losing the first adoption response, even if recovery first retries",
  () =>
    Effect.gen(function* () {
      for (const retry of [false, true]) {
        const dir = yield* storeDir;
        let value = "original",
          lose = true;
        const api = () =>
          Layer.mock(Api.ConvexClient)({
            listEnvironmentVariables: () =>
              Effect.succeed({ BORROWED: Redacted.make(value) }),
            updateEnvironmentVariables: (_url, _key, changes) =>
              Effect.gen(function* () {
                const entry = changes[0].value;
                value =
                  typeof entry === "string"
                    ? entry
                    : entry == null
                      ? ""
                      : Redacted.value(entry);
                if (lose) {
                  lose = false;
                  return yield* Api.ConvexApiError.make({
                    operation: "updateEnvironmentVariables",
                    code: "TransportError",
                  });
                }
              }),
          });
        const declaration = Convex.EnvironmentVariables("Borrow", {
          url: target.url,
          deployKey: oldKey,
          variables: { BORROWED: "managed" },
        }).pipe(adopt(), Effect.asVoid);
        const failed = yield* failureOf(reopen(dir, api()).deploy(declaration));
        expect(failed).toContain("TransportError");
        expect(value).toBe("managed");
        if (retry) yield* reopen(dir, api()).deploy(declaration);
        yield* reopen(dir, api()).deploy(Effect.void);
        expect(value).toBe("original");
      }
    }),
);

it.effect(
  "ignores only a missing deployment during authoritative cleanup",
  () =>
    Effect.gen(function* () {
      const dir = yield* storeDir;
      let status = 0;
      const api = () =>
        Layer.mock(Api.ConvexClient)({
          updateEnvironmentVariables: () =>
            status === 0
              ? Effect.void
              : status === 404
                ? Effect.fail(
                    Api.ConvexNotFound.make({
                      operation: "updateEnvironmentVariables",
                      code: "HttpError",
                      status,
                    }),
                  )
                : Effect.fail(
                    Api.ConvexApiError.make({
                      operation: "updateEnvironmentVariables",
                      code: "HttpError",
                      status,
                    }),
                  ),
        });
      yield* reopen(dir, api()).deploy(writer(oldKey));
      status = 403;
      const denied = yield* failureOf(reopen(dir, api()).deploy(Effect.void));
      expect(denied).toContain("403");
      status = 404;
      yield* reopen(dir, api()).deploy(Effect.void);
    }),
);

it.effect(
  "does not write when the state store rejects the cleanup receipt",
  () =>
    Effect.gen(function* () {
      let mutations = 0;
      const state = Layer.succeed(
        State,
        InMemoryService({}).pipe(
          Effect.map((store) => ({
            ...store,
            set: (request) =>
              "attr" in request.value && request.value.attr !== undefined
                ? Effect.fail(
                    new StateStoreError({ message: "injected state failure" }),
                  )
                : store.set(request),
          })),
        ),
      );
      const client = Layer.mock(Api.ConvexClient)({
        updateEnvironmentVariables: () =>
          Effect.sync(() => {
            mutations++;
          }),
      });
      const diagnostic = yield* failureOf(
        stackFixture({ client, state }).deploy(writer(oldKey)),
      );
      expect(diagnostic).toContain("checkpoint failed");
      expect(mutations).toBe(0);
    }),
);
