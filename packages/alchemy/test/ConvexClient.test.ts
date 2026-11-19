import * as ConvexClient from "@confect/alchemy/ConvexClient";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { mockFetch } from "./fixtures/Fetch.js";

const opaque = Redacted.make("opaque-test-only-secret");
const url = "https://sample-37.eu-west-1.convex.cloud";

it.effect(
  "accepts opaque credentials only at trusted cloud origins and sanitizes failures",
  () =>
    Effect.gen(function* () {
      let calls = 0;
      const transport = Layer.succeed(
        FetchHttpClient.Fetch,
        mockFetch(() => {
          calls++;
          return Promise.resolve(Response.json({ environmentVariables: {} }));
        }),
      );
      const ctx = yield* Layer.build(
        ConvexClient.layer().pipe(Layer.provide(transport)),
      );
      const client = Context.get(ctx, ConvexClient.ConvexClient);
      for (const location of [
        "http://sample-37.convex.cloud",
        "https://sample-37.convex.cloud.example.org",
        "https://sample-37.convex.cloud:9000",
        "https://user:private@sample-37.convex.cloud",
        url + "/api",
        url + "?value=private",
        url + "#private",
      ]) {
        const failure = yield* client
          .listEnvironmentVariables(location, opaque)
          .pipe(Effect.flip);
        expect(failure).toBeInstanceOf(ConvexClient.ConvexApiError);
        expect(failure.code).toBe("InvalidRequest");
        expect(Cause.pretty(Cause.fail(failure))).not.toContain("private");
      }
      yield* client.listEnvironmentVariables(url + "/", opaque);
      expect(calls).toBe(1);
      const failure = yield* client
        .listProjects(1)
        .pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({}),
          ),
          Effect.flip,
        );
      expect(failure.code).toBe("InvalidConfiguration");
      expect(calls).toBe(1);
    }),
);

it.effect(
  "escapes ordinary API path segments and merges safe custom headers from both scopes",
  () =>
    Effect.gen(function* () {
      const ctx = yield* Layer.build(
        ConvexClient.layer({ token: opaque }).pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.RequestInit, {
              headers: {
                "x-build": "build",
                "x-shared": "base",
                authorization: "untrusted",
                "content-type": "invalid",
                host: "undesired",
              },
            }),
          ),
        ),
      );
      const client = Context.get(ctx, ConvexClient.ConvexClient);
      const result = yield* client
        .updateDeployment("path with/slash", { reference: "test" })
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, {
            headers: {
              "x-shared": "override",
              "x-call": "scoped",
              "x-http-method-override": "DELETE",
            },
          }),
          Effect.provideService(
            FetchHttpClient.Fetch,
            mockFetch((input, init) => {
              const request = new Request(input, init);
              expect(request.url).toContain(
                "https://api.convex.dev/v1/deployments/path%20with%2Fslash",
              );
              expect(request.headers.get("authorization")).toBe(
                "Bearer opaque-test-only-secret",
              );
              expect(request.headers.get("content-type")).toBe(
                "application/json",
              );
              expect(request.headers.get("host")).toBe(null);
              expect(request.headers.get("x-http-method-override")).toBe(null);
              expect(request.headers.get("x-build")).toBe("build");
              expect(request.headers.get("x-shared")).toBe("override");
              expect(request.headers.get("x-call")).toBe("scoped");
              return Promise.resolve(new Response(null));
            }),
          ),
          Effect.exit,
        );
      expect(result._tag).toBe("Success");
    }),
);

it.effect(
  "applies scoped fetch options at construction and call time without replacing the request",
  () =>
    Effect.gen(function* () {
      let bound = 0;
      const ctx = yield* Layer.build(
        ConvexClient.layer({ token: opaque }).pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(
                FetchHttpClient.Fetch,
                mockFetch((_input, init) => {
                  bound++;
                  expect(init?.cache).toBe("no-store");
                  return Promise.resolve(
                    new Response("secret error body", { status: 404 }),
                  );
                }),
              ),
              Layer.succeed(FetchHttpClient.RequestInit, { cache: "no-store" }),
            ),
          ),
        ),
      );
      const client = Context.get(ctx, ConvexClient.ConvexClient);
      const missing = yield* client.getProject(1).pipe(Effect.flip);
      expect(missing).toBeInstanceOf(ConvexClient.ConvexNotFound);
      expect(missing).toMatchObject({
        operation: "getProject",
        status: 404,
        code: "HttpError",
      });
      let scoped = 0;

      const conflict = yield* client
        .updateEnvironmentVariables(url, opaque, [
          { name: "TEST", value: "secret-value" },
        ])
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, {
            method: "DELETE",
            body: "replaced",
            redirect: "follow",
            signal: AbortSignal.abort(),
            headers: { authorization: "untrusted" },
            keepalive: true,
          }),
          Effect.provideService(
            FetchHttpClient.Fetch,
            mockFetch((input, init) => {
              const request = new Request(input, init);
              scoped++;
              expect(request.url).toBe(
                url + "/api/v1/update_environment_variables",
              );
              expect(request.method).toBe("POST");
              expect(request.headers.get("Authorization")).toBe(
                "Convex opaque-test-only-secret",
              );
              expect(request.signal.aborted).toBe(false);
              expect(request.keepalive).toBe(true);
              expect(request.cache).toBe("no-store");
              expect(request.redirect).toBe("manual");
              return request.text().then((body) => {
                expect(body).toContain("secret-value");
                return new Response("secret error body", { status: 409 });
              });
            }),
          ),
          Effect.flip,
        );
      expect(conflict).toBeInstanceOf(ConvexClient.ConvexConflict);
      expect(conflict).toMatchObject({
        operation: "updateEnvironmentVariables",
        status: 409,
      });
      expect(conflict.message).not.toContain("secret");
      expect([bound, scoped]).toEqual([1, 1]);
    }),
);
