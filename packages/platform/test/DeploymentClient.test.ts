import type { DeploymentApi } from "@confect/platform";
import * as DeploymentClient from "@confect/platform/DeploymentClient";
import type { RequestFailure } from "@confect/platform/PlatformError";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { vi } from "vitest";

const token = Redacted.make("test-deployment-key");
const Json = Schema.fromJsonString(Schema.Unknown);
const selection = {
  _other: "included",
  "": {
    _other: "excluded",
    posts: { _other: "included" },
    users: { _other: "included", ssn: "excluded" },
  },
} satisfies DeploymentClient.Selection;
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
        baseUrl: "https://other.example.test",
        headers: { Authorization: "unexpected" },
        redirect: "follow",
      };
      // @ts-expect-error Extra arguments from JavaScript cannot override the authenticated transport.
      const update = client.updateUsageLimit("first", limit, options);
      expectTypeOf(update).toEqualTypeOf<
        Effect.Effect<DeploymentApi.UsageLimitResponse, RequestFailure>
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
      const pause = client.pauseDeployment;
      expectTypeOf<Effect.Success<typeof pause>>().not.toBeNever();
      expectTypeOf<Effect.Success<typeof pause>>().toExtend<void>();
      expect(fetch).not.toHaveBeenCalled();
      const result = yield* pause;
      expect(result).toBeUndefined();
      yield* pause;
      expect(fetch).toHaveBeenCalledTimes(2);
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
      const fiber = yield* client.getCanonicalUrls.pipe(Effect.forkScoped);
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
    // @ts-expect-error Updating a usage limit requires the replacement body.
    expectTypeOf(client.updateUsageLimit("first"));
    const invalid = { ...limit, enabled: "yes" };
    // @ts-expect-error An update must use the endpoint's write schema.
    expectTypeOf(client.updateUsageLimit("first", invalid));
    expectTypeOf(client).not.toHaveProperty("request");
    expectTypeOf(client).not.toHaveProperty("getTokenDetails");
    expectTypeOf(
      // @ts-expect-error Callers cannot override a client's authenticated destination.
      client.getCanonicalUrls({ baseUrl: "https://other.example.test" }),
    );
    // @ts-expect-error Deployment audit queries must include their starting timestamp.
    expectTypeOf(client.listAuditLogEvents({ limit: 4 }));
    expectTypeOf(client.listActiveSyncs()).toEqualTypeOf<
      Effect.Effect<DeploymentApi.ListActiveSyncsResponse, RequestFailure>
    >();
  };
  expectTypeOf(check).toBeFunction();
});

it.effect(
  "keeps environment values redacted until writes execute, including empty strings and deletions",
  () =>
    Effect.gen(function* () {
      const fetch = vi
        .fn((_request: Request) => Promise.resolve(new Response(null)))
        .mockResolvedValueOnce(
          Response.json({
            environmentVariables: { TOKEN: "test-secret", EMPTY: "" },
          }),
        );
      const client = DeploymentClient.make("test-123", token, { fetch });
      const { environmentVariables } = yield* client.listEnvironmentVariables;
      expectTypeOf(environmentVariables).toEqualTypeOf<
        Record<string, Redacted.Redacted<string>>
      >();
      expect(Redacted.value(environmentVariables.TOKEN)).toBe("test-secret");
      expect(Redacted.value(environmentVariables.EMPTY)).toBe("");
      const serialized = yield* Schema.encodeEffect(Json)(environmentVariables);
      expect(serialized).not.toContain("test-secret");

      const changes = [
        { name: "SECRET", value: environmentVariables.TOKEN },
        { name: "EMPTY", value: "" },
        { name: "DELETE" },
        { name: "DELETE_TOO", value: null },
      ] as const;
      yield* client.updateEnvironmentVariables({ changes });
      const [, [write]] = fetch.mock.calls;
      expect(new URL(write.url).pathname).toBe(
        "/api/v1/update_environment_variables",
      );
      const body: unknown = yield* Effect.promise(() => write.json());
      expect(body).toEqual({
        changes: [
          { name: "SECRET", value: "test-secret" },
          { name: "EMPTY", value: "" },
          { name: "DELETE" },
          { name: "DELETE_TOO", value: null },
        ],
      });
      expect(Redacted.isRedacted(changes[0].value)).toBe(true);
      const forgotten = Redacted.make("forgotten");
      const writeForgotten = client.updateEnvironmentVariables({
        changes: [{ name: "LOST", value: forgotten }],
      });
      Redacted.wipeUnsafe(forgotten);
      const failure = yield* Effect.flip(writeForgotten);
      expect(failure).toMatchObject({
        _tag: "InvalidRequest",
        operation: "updateEnvironmentVariables",
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    }),
);

it.effect(
  "redacts log stream destinations, access keys and HMAC secrets while preserving variant fields",
  () =>
    Effect.gen(function* () {
      const webhook = {
        id: "hook",
        status: { type: "active" },
        logStreamType: "webhook",
        format: "json",
        hmacSecret: "secret-hmac",
        url: "https://test.example/secret-path",
      } satisfies DeploymentApi.LogStreamConfig;
      const streams = [
        webhook,
        {
          id: "s3",
          status: { type: "pending" },
          logStreamType: "s3Export",
          bucket: "bucket",
          region: "region",
          period: "daily",
          selection: { _other: "excluded" },
          accessKeyId: "secret-access-id",
        },
        {
          id: "axiom",
          status: { type: "pending" },
          logStreamType: "axiom",
          datasetName: "dataset",
          attributes: [],
          ingestUrl: "https://test.example/secret-axiom",
        },
        {
          id: "posthog",
          status: { type: "pending" },
          logStreamType: "postHogLogs",
          host: "https://test.example/secret-posthog",
        },
        {
          id: "error-tracker",
          status: { type: "pending" },
          logStreamType: "postHogErrorTracking",
          host: null,
        },
        {
          id: "datadog",
          status: { type: "active" },
          logStreamType: "datadog",
          siteLocation: "US1",
          ddTags: ["test"],
        },
        {
          id: "sentry",
          status: { type: "active" },
          logStreamType: "sentry",
          tags: { environment: "test" },
        },
      ] satisfies DeploymentApi.LogStreamConfig[];
      const fetch = vi
        .fn((_request: Request) => Promise.resolve(new Response(null)))
        .mockResolvedValueOnce(
          Response.json(
            Arr.map(streams, (config) =>
              config.logStreamType === "sentry"
                ? { ...config, dsn: "secret-undeclared" }
                : config,
            ),
          ),
        )
        .mockResolvedValueOnce(Response.json(webhook))
        .mockResolvedValueOnce(
          Response.json({
            id: webhook.id,
            hmacSecret: webhook.hmacSecret,
            logStreamType: "webhook",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            logStreamType: "webhook",
            hmacSecret: "secret-rotated",
          }),
        );
      const client = DeploymentClient.make("test-123", token, { fetch });
      const listed = yield* client.listLogStreams;
      const serialized = yield* Schema.encodeEffect(Json)(listed);
      expect(serialized).not.toContain("secret-");
      const s3 = listed[1];
      if (s3.logStreamType !== "s3Export") return expect.unreachable();
      expectTypeOf(s3.selection).toEqualTypeOf<DeploymentClient.Selection>();
      expect(Redacted.value(s3.accessKeyId)).toBe("secret-access-id");
      expect(listed[4]).toMatchObject({ host: null });
      expect(listed[5]).toEqual(streams[5]);
      expect(listed[6]).toEqual(streams[6]);

      const stream = yield* client.getLogStream(webhook.id);
      if (stream.logStreamType !== "webhook") return expect.unreachable();
      expect(Redacted.value(stream.hmacSecret)).toBe(webhook.hmacSecret);
      expect(Redacted.value(stream.url)).toBe(webhook.url);

      const created = yield* client.createLogStream({
        logStreamType: "webhook",
        url: stream.url,
        format: "json",
      });
      if (created.logStreamType !== "webhook") return expect.unreachable();
      expect(Redacted.value(created.hmacSecret)).toBe(webhook.hmacSecret);
      const rotated = yield* client.rotateWebhookSecret(webhook.id);
      expect(Redacted.value(rotated.hmacSecret)).toBe("secret-rotated");
      const serializedSecrets = yield* Schema.encodeEffect(Json)([
        stream,
        created,
        rotated,
      ]);
      expect(serializedSecrets).not.toContain("secret-");

      yield* client.updateLogStream("s3", {
        logStreamType: "s3Export",
        secretAccessKey: Redacted.make("secret-key"),
        accessKeyId: null,
        selection,
      });
      const createRequest = fetch.mock.calls[2][0];
      const createBody: unknown = yield* Effect.promise(() =>
        createRequest.json(),
      );
      expect(createBody).toEqual({
        logStreamType: "webhook",
        format: "json",
        url: webhook.url,
      });
      const updateRequest = fetch.mock.calls[4][0];
      const updateBody: unknown = yield* Effect.promise(() =>
        updateRequest.json(),
      );
      expect(updateBody).toEqual({
        logStreamType: "s3Export",
        secretAccessKey: "secret-key",
        accessKeyId: null,
        selection,
      });
    }),
);

it.effect(
  "streams audit entries on demand and preserves the original filters and opaque cursor",
  () =>
    Effect.gen(function* () {
      const cursor = "next&after=now";
      const fetch = vi.fn((request: Request) => {
        const last = new URL(request.url).searchParams.get("cursor") === cursor;
        return Promise.resolve(
          Response.json({
            items: [
              {
                actor: { kind: "system" },
                action: "pause_deployment",
                createTime: last ? 16 : 14,
                metadata: {},
              },
            ],
            pagination: last
              ? { hasMore: false }
              : { hasMore: true, nextCursor: cursor },
          }),
        );
      });
      const client = DeploymentClient.make("test-123", token, { fetch });
      const stream = client.streamAuditLogEvents({
        from: 10,
        limit: 1,
        cursor: "resume",
      });
      expect(fetch).not.toHaveBeenCalled();
      const one = yield* stream.pipe(Stream.take(1), Stream.runCollect);
      expect(Arr.map(one, (entry) => entry.createTime)).toEqual([14]);
      expect(fetch).toHaveBeenCalledTimes(1);
      const all = yield* Stream.runCollect(stream);
      expect(Arr.map(all, (entry) => entry.createTime)).toEqual([14, 16]);
      expect(
        Arr.map(fetch.mock.calls, ([request]) =>
          Record.fromEntries(new URL(request.url).searchParams),
        ),
      ).toEqual([
        { from: "10", limit: "1", cursor: "resume" },
        { from: "10", limit: "1", cursor: "resume" },
        { from: "10", limit: "1", cursor },
      ]);
    }),
);

it.effect(
  "follows empty active-sync pages but returns the data-sync protocol response as one step",
  () =>
    Effect.gen(function* () {
      const sync = {
        syncId: "abc",
        status: {
          type: "stale",
          totalTables: 1,
          numDocumentsSynced: 1,
          syncedTs: 20,
        },
        lastUpdated: 21,
      } satisfies DeploymentApi.ActiveDataSync;
      const response = {
        syncId: "abc",
        status: { type: "upToDate", snapshotTs: 20 },
        truncates: [{ component: "", table: "messages" }],
        values: [
          {
            component: "",
            table: "messages",
            ts: 20,
            deleted: false,
            value: { message: "hello" },
          },
        ],
        pagination: { hasMore: true, nextCursor: "persistent-cursor" },
      };
      const fetch = vi
        .fn((_request: Request) => Promise.resolve(new Response(null)))
        .mockResolvedValueOnce(
          Response.json({
            syncs: [],
            pagination: { hasMore: true, nextCursor: "page-2" },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ syncs: [sync], pagination: { hasMore: false } }),
        )
        .mockResolvedValueOnce(Response.json(response));
      const client = DeploymentClient.make("test-123", token, { fetch });
      const syncs = yield* Stream.runCollect(client.streamActiveSyncs());
      expect(syncs).toEqual([sync]);
      const step = yield* client.syncData({
        cursor: "persistent-cursor",
        selection,
      });
      expectTypeOf(step.values[0].value.message).toEqualTypeOf<Schema.Json>();
      expect(step.values[0].value.message).toBe("hello");
      expect(step).toEqual(response);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(new URL(fetch.mock.calls[0][0].url).search).toBe("");
      expect(new URL(fetch.mock.calls[1][0].url).search).toBe("?cursor=page-2");
      const syncBody: unknown = yield* Effect.promise(() =>
        fetch.mock.calls[2][0].json(),
      );
      expect(syncBody).toEqual({ cursor: "persistent-cursor", selection });
    }),
);

it.effect(
  "accepts S3 export selection defaults and rejects a bare included component or table before sending",
  () =>
    Effect.gen(function* () {
      const fetch = vi.fn((_request: Request) =>
        Promise.resolve(Response.json({ id: "s3", logStreamType: "s3Export" })),
      );
      const client = DeploymentClient.make("test-123", token, { fetch });
      const s3 = {
        logStreamType: "s3Export",
        bucket: "bucket",
        region: "region",
        accessKeyId: "test-id",
        secretAccessKey: Redacted.make("test-key"),
        period: "daily",
        selection,
      } satisfies DeploymentClient.CreateLogStreamInput;
      yield* client.createLogStream(s3);
      const body: unknown = yield* Effect.promise(() =>
        fetch.mock.calls[0][0].json(),
      );
      expect(body).toMatchObject({ selection, secretAccessKey: "test-key" });
      const invalid = { _other: "included", root: "included" } as const;
      const badSync = yield* Effect.flip(
        client.syncData({ selection: invalid }),
      );
      const badCreate = yield* Effect.flip(
        client.createLogStream({ ...s3, selection: invalid }),
      );
      const badUpdate = yield* Effect.flip(
        client.updateLogStream("s3", {
          logStreamType: "s3Export",
          selection: {
            _other: "included",
            root: { _other: "included", todos: "included" },
          },
        }),
      );
      expect(badSync).toMatchObject({
        _tag: "InvalidRequest",
        operation: "syncData",
      });
      expect(badCreate).toMatchObject({
        _tag: "InvalidRequest",
        operation: "createLogStream",
      });
      expect(badUpdate).toMatchObject({
        _tag: "InvalidRequest",
        operation: "updateLogStream",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }),
);
