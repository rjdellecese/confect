import type { ManagementApi } from "@confect/platform";
import * as ManagementClient from "@confect/platform/ManagementClient";
import { PlatformError } from "@confect/platform/PlatformError";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const auditPath = "/teams/{team_id}/list_audit_log_events";
const token = Redacted.make("test-management-token");

it.effect("sends a typed team audit query with management credentials", () =>
  Effect.gen(function* () {
    const page = { items: [], pagination: { hasMore: false } };
    const fetch = vi.fn((_request: Request) =>
      Promise.resolve(Response.json(page)),
    );
    const context = yield* Layer.build(
      ManagementClient.layer(token, {
        fetch,
        baseUrl: "https://management.example.test/v1",
      }),
    );
    const client = Context.get(context, ManagementClient.ManagementClient);
    const audit = client.request("get", auditPath, {
      params: {
        path: { team_id: 17 },
        query: { from: 1, to: 2, cursor: "a&b=c" },
      },
    });
    expect(fetch).not.toHaveBeenCalled();
    expectTypeOf(audit).toEqualTypeOf<
      Effect.Effect<ManagementApi.ListAuditLogEventsResponse, PlatformError>
    >();
    const result = yield* audit;
    expect(result).toEqual(page);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [[request]] = fetch.mock.calls;
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(
      "https://management.example.test/v1/teams/17/list_audit_log_events",
    );
    expect(Record.fromEntries(url.searchParams)).toEqual({
      from: "1",
      to: "2",
      cursor: "a&b=c",
    });
    expect(request.method).toBe("GET");
    expect(request.headers.get("Authorization")).toBe(
      "Bearer test-management-token",
    );
    expect(request.headers.get("Convex-Client")).toMatch(/^convex-platform-/);
    expect(request.redirect).not.toBe("follow");
  }),
);

const privateDetail = "synthetic-private-detail";

it.effect.each([
  {
    name: "empty 404",
    fetch: () => Promise.resolve(new Response(null, { status: 404 })),
    code: "HttpError",
    status: 404,
  },
  {
    name: "non-JSON 429",
    fetch: () => Promise.resolve(new Response(privateDetail, { status: 429 })),
    code: "HttpError",
    status: 429,
  },
  {
    name: "503 with an unreadable body",
    fetch: () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start: (controller) =>
              controller.error(new TypeError(privateDetail)),
          }),
          { status: 503 },
        ),
      ),
    code: "HttpError",
    status: 503,
  },
  {
    name: "malformed success",
    fetch: () => Promise.resolve(new Response(privateDetail, { status: 200 })),
    code: "InvalidResponse",
    status: 200,
  },
  {
    name: "transport rejection",
    fetch: () => Promise.reject(new TypeError(privateDetail)),
    code: "TransportError",
    status: undefined,
  },
])(
  "classifies $name without exposing private data",
  ({ fetch, code, status }) =>
    Effect.gen(function* () {
      const client = ManagementClient.make(token, { fetch });
      const error = yield* client
        .request("get", auditPath, {
          params: {
            path: { team_id: 17 },
            query: { from: 1, to: 2, cursor: privateDetail },
          },
        })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PlatformError);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      const json = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(error);
      const diagnostic = `${json} ${error.message} ${error.stack} ${String(error.cause)}`;
      expect(diagnostic).not.toContain(privateDetail);
      expect(diagnostic).not.toContain(Redacted.value(token));
    }),
);

it.effect(
  "returns the HTTP status without waiting for a stalled body or its cancellation",
  () =>
    Effect.gen(function* () {
      const stalled = Promise.withResolvers<void>().promise;
      const pull = vi.fn(() => stalled);
      const cancel = vi.fn(() => stalled);
      const body = new ReadableStream<Uint8Array>(
        { pull, cancel },
        { highWaterMark: 0 },
      );
      const client = ManagementClient.make(token, {
        fetch: () => Promise.resolve(new Response(body, { status: 504 })),
      });
      const error = yield* client
        .request("get", "/token_details")
        .pipe(Effect.flip);
      expect(error.code).toBe("HttpError");
      expect(error.status).toBe(504);
      expect(pull).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(1);
    }),
);

it.effect(
  "does not send a request when its credential cannot form a header",
  () =>
    Effect.gen(function* () {
      const fetch = vi.fn(() => Promise.resolve(Response.json({})));
      const client = ManagementClient.make(
        Redacted.make("invalid\n" + privateDetail),
        { fetch },
      );
      const error = yield* client
        .request("get", "/token_details")
        .pipe(Effect.flip);
      expect(fetch).not.toHaveBeenCalled();
      expect(error.code).toBe("InvalidRequest");
      expect(error.status).toBeUndefined();
      expect(String(error)).not.toContain(privateDetail);
    }),
);

it("requires the method, path and parameters from the same management operation", () => {
  const check = (client: ReturnType<typeof ManagementClient.make>) => {
    const tokenRequest = client.request(
      "post",
      "/teams/{team_id}/create_access_token",
      {
        params: { path: { team_id: 17 } },
      },
    );
    expectTypeOf<
      Effect.Success<typeof tokenRequest>
    >().toEqualTypeOf<ManagementApi.CreateTeamAccessTokenResponse>();
    // @ts-expect-error An audit query needs both its path and query parameters.
    expectTypeOf(client.request("get", auditPath));
    const fromOnly = { path: { team_id: 17 }, query: { from: 1 } };
    // @ts-expect-error The end of the time range is required.
    expectTypeOf(client.request("get", auditPath, { params: fromOnly }));
    const slug = { path: { team_id: "17" }, query: { from: 1, to: 2 } };
    // @ts-expect-error The audit operation expects a numeric team ID.
    expectTypeOf(client.request("get", auditPath, { params: slug }));
    // @ts-expect-error This management endpoint does not accept POST.
    expectTypeOf(client.request("post", "/token_details"));
    // @ts-expect-error Deployment endpoints do not belong to the management client.
    expectTypeOf(client.request("get", "/deployment_info"));
  };
  expectTypeOf(check).toBeFunction();
});
