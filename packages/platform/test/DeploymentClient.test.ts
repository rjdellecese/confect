import type { DeploymentApi } from "@confect/platform";
import * as DeploymentClient from "@confect/platform/DeploymentClient";
import type { PlatformError } from "@confect/platform/PlatformError";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { vi } from "vitest";

const token = Redacted.make("test-deployment-key");
const limitPath = "/update_usage_limit/{id}";
const limit = {
  metric: "functionCalls",
  window: "day",
  limitType: "warning",
  limit: 1000,
  enabled: true,
} satisfies DeploymentApi.UsageLimitConfigRequest;

it.effect(
  "posts a usage limit to the regional deployment, not the management host",
  () =>
    Effect.gen(function* () {
      const deployment = "https://test-123.eu-west-1.convex.cloud";
      const response = { usageLimit: { ...limit, id: "first" } };
      const fetch = vi.fn((_request: Request) =>
        Promise.resolve(Response.json(response)),
      );
      const context = yield* Layer.build(
        DeploymentClient.layer(deployment, token, { fetch }),
      );
      const client = Context.get(context, DeploymentClient.DeploymentClient);
      const options = {
        params: { path: { id: "first" } },
        body: limit,
        baseUrl: "https://other.example.test",
        headers: { Authorization: "unexpected" },
        redirect: "follow",
      };
      const update = client.request("post", limitPath, options);
      expectTypeOf(update).toEqualTypeOf<
        Effect.Effect<DeploymentApi.UsageLimitResponse, PlatformError>
      >();
      const result = yield* update;
      expect(result).toEqual(response);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [[request]] = fetch.mock.calls;
      expect(request.method).toBe("POST");
      expect(request.url).toBe(deployment + "/api/v1/update_usage_limit/first");
      expect(request.headers.get("Authorization")).toBe(
        "Convex test-deployment-key",
      );
      expect(request.headers.get("Content-Type")).toBe("application/json");
      expect(request.headers.get("Convex-Client")).toMatch(/^convex-platform-/);
      expect(request.redirect).not.toBe("follow");
      const body: unknown = yield* Effect.promise(() => request.json());
      expect(body).toEqual(limit);
    }),
);

it.effect.each([200, 204])(
  "returns no value for an empty %i on a bare deployment name",
  (status) =>
    Effect.gen(function* () {
      const fetch = vi.fn((_request: Request) =>
        Promise.resolve(new Response(null, { status })),
      );
      const client = DeploymentClient.make("test-123", token, { fetch });
      const pause = client.request("post", "/pause_deployment");
      expectTypeOf<Effect.Success<typeof pause>>().not.toBeNever();
      expectTypeOf<Effect.Success<typeof pause>>().toExtend<void>();
      const result = yield* pause;
      expect(result).toBeUndefined();
      const [[request]] = fetch.mock.calls;
      expect(request.url).toBe(
        "https://test-123.convex.cloud/api/v1/pause_deployment",
      );
    }),
);

it.effect("aborts an in-flight HTTP request when the owning scope closes", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<AbortSignal>();
    const client = DeploymentClient.make("test-123", token, {
      fetch: (request) => {
        const pending = Promise.withResolvers<Response>();
        request.signal.addEventListener(
          "abort",
          () => pending.reject(request.signal.reason),
          { once: true },
        );
        Deferred.doneUnsafe(entered, Effect.succeed(request.signal));
        return pending.promise;
      },
    });
    const pendingRequest = yield* Effect.gen(function* () {
      const fiber = yield* client
        .request("get", "/get_canonical_urls")
        .pipe(Effect.forkScoped);
      const signal = yield* Deferred.await(entered);
      expect(signal.aborted).toBe(false);
      return { fiber, signal };
    }).pipe(Effect.scoped);
    expect(pendingRequest.signal.aborted).toBe(true);
    const exit = yield* Fiber.await(pendingRequest.fiber);
    expect(Exit.hasInterrupts(exit)).toBe(true);
  }),
);

it("checks deployment request bodies and does not expose per-request transport controls", () => {
  const check = (client: ReturnType<typeof DeploymentClient.make>) => {
    const params = { path: { id: "first" } };
    // @ts-expect-error Updating a usage limit requires the replacement body.
    expectTypeOf(client.request("post", limitPath, { params }));
    const invalid = { params, body: { ...limit, enabled: "yes" } };
    // @ts-expect-error An update must use the endpoint's write schema.
    expectTypeOf(client.request("post", limitPath, invalid));
    // @ts-expect-error A management path is not a deployment path.
    expectTypeOf(client.request("get", "/token_details"));
    expectTypeOf(
      client.request("get", "/get_canonical_urls", {
        // @ts-expect-error Callers cannot override a client's authenticated destination.
        baseUrl: "https://other.example.test",
      }),
    );
  };
  expectTypeOf(check).toBeFunction();
});
