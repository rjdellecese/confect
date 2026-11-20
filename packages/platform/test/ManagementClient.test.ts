import type { ManagementApi } from "@confect/platform";
import * as ManagementClient from "@confect/platform/ManagementClient";
import * as PlatformError from "@confect/platform/PlatformError";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Inspectable from "effect/Inspectable";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { vi } from "vitest";

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
    const audit = client.listAuditLogEvents(17, {
      from: 1,
      to: 2,
      cursor: "a&b=c",
    });
    expect(fetch).not.toHaveBeenCalled();
    expectTypeOf(audit).toEqualTypeOf<
      Effect.Effect<
        ManagementApi.ListAuditLogEventsResponse,
        PlatformError.RequestFailure
      >
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

it.effect.each(["", "not-a-url", "https://example.test/v1?token=private"])(
  "never falls back to another host for an invalid explicit base URL: %s",
  (baseUrl) =>
    Effect.gen(function* () {
      const fetch = vi.fn(() => Promise.resolve(new Response(null)));
      const client = ManagementClient.make(token, { baseUrl, fetch });
      const error = yield* Effect.flip(client.getTokenDetails);
      expect(error).toMatchObject({
        _tag: "InvalidRequest",
        operation: "getTokenDetails",
      });
      expect(fetch).not.toHaveBeenCalled();
    }),
);

it.effect("keeps a wiped access token in the request error channel", () =>
  Effect.gen(function* () {
    const credential = Redacted.make("test-forgotten-token");
    Redacted.wipeUnsafe(credential);
    const fetch = vi.fn(() => Promise.resolve(new Response(null)));
    const client = ManagementClient.make(credential, { fetch });
    const error = yield* Effect.flip(client.getTokenDetails);
    expect(error).toMatchObject({
      _tag: "InvalidRequest",
      operation: "getTokenDetails",
    });
    expect(fetch).not.toHaveBeenCalled();
  }),
);

it.effect.each([
  {
    name: "empty 404",
    fetch: () => Promise.resolve(new Response(null, { status: 404 })),
    failure: PlatformError.HttpError,
    status: 404,
  },
  {
    name: "non-JSON 429",
    fetch: () => Promise.resolve(new Response(privateDetail, { status: 429 })),
    failure: PlatformError.HttpError,
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
    failure: PlatformError.HttpError,
    status: 503,
  },
  {
    name: "malformed success",
    fetch: () => Promise.resolve(new Response(privateDetail, { status: 200 })),
    failure: PlatformError.InvalidResponse,
    status: 200,
  },
  {
    name: "well-formed JSON with an invalid page shape",
    fetch: () =>
      Promise.resolve(
        Response.json({
          items: [{ action: privateDetail }],
          pagination: { hasMore: false },
        }),
      ),
    failure: PlatformError.InvalidResponse,
    status: 200,
  },
  {
    name: "transport rejection",
    fetch: () => Promise.reject(new TypeError(privateDetail)),
    failure: PlatformError.TransportError,
    status: undefined,
  },
] as const)(
  "classifies $name without exposing private data",
  ({ fetch, failure, status }) =>
    Effect.gen(function* () {
      const client = ManagementClient.make(token, { fetch });
      const error = yield* client
        .listAuditLogEvents(17, { from: 1, to: 2, cursor: privateDetail })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(failure);
      expect(error.operation).toBe("listAuditLogEvents");
      expect("status" in error ? error.status : undefined).toBe(status);
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
      const error = yield* client.getTokenDetails.pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: "HttpError", status: 504 });
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
      const error = yield* client.getTokenDetails.pipe(Effect.flip);
      expect(fetch).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(PlatformError.InvalidRequest);
      expect(error).not.toHaveProperty("status");
      expect(String(error)).not.toContain(privateDetail);
    }),
);

const project = {
  id: 7,
  slug: "project-a",
  name: "Project A",
  teamId: 17,
  teamSlug: "team-a",
  createTime: 100,
} satisfies ManagementApi.ProjectResponse;

it.effect(
  "sends positional slug parameters and the typed project update body",
  () =>
    Effect.gen(function* () {
      const fetch = vi.fn((_request: Request) =>
        Promise.resolve(Response.json(project)),
      );
      const client = ManagementClient.make(token, { fetch });
      const bySlug = yield* client.getProjectBySlug("team-a", "project-a");
      expect(bySlug).toEqual(project);
      const updates = { name: project.name, slug: project.slug };
      const updated = yield* client.updateProject(7, updates);
      expect(updated).toEqual(project);
      const [[lookup], [patch]] = fetch.mock.calls;
      expect(new URL(lookup.url).pathname).toBe(
        "/v1/teams/team-a/projects/project-a",
      );
      expect(lookup.method).toBe("GET");
      expect(new URL(patch.url).pathname).toBe("/v1/projects/7");
      expect(patch.method).toBe("PATCH");
      const body: unknown = yield* Effect.promise(() => patch.json());
      expect(body).toEqual(updates);
    }),
);

it.effect(
  "streams one item at a time and retains filters when advancing the cursor",
  () =>
    Effect.gen(function* () {
      const second = { ...project, id: 6 };
      const query = { cursor: "initial", limit: 1, q: "a & b" };
      const fetch = vi.fn((request: Request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return Promise.resolve(
          Response.json(
            cursor === query.cursor
              ? {
                  items: [project],
                  pagination: { hasMore: true, nextCursor: "next&=page" },
                }
              : { items: [second], pagination: { hasMore: false } },
          ),
        );
      });
      const stream = ManagementClient.make(token, { fetch }).streamProjects(
        17,
        query,
      );
      expectTypeOf(stream).toEqualTypeOf<
        Stream.Stream<
          ManagementApi.ProjectResponse,
          PlatformError.RequestFailure | PlatformError.InvalidPagination
        >
      >();
      expect(fetch).not.toHaveBeenCalled();
      const firstOnly = yield* stream.pipe(Stream.take(1), Stream.runCollect);
      expect(firstOnly).toEqual([project]);
      expect(fetch).toHaveBeenCalledTimes(1);
      const all = yield* Stream.runCollect(stream);
      expect(all).toEqual([project, second]);
      expect(fetch).toHaveBeenCalledTimes(3);
      for (const [index, [request]] of fetch.mock.calls.entries()) {
        expect(Record.fromEntries(new URL(request.url).searchParams)).toEqual({
          q: query.q,
          limit: "1",
          cursor: index < 2 ? query.cursor : "next&=page",
        });
      }
      expect(query.cursor).toBe("initial");
    }),
);

it.effect.each([
  { nextCursor: privateDetail },
  { nextCursor: "" },
  { nextCursor: null },
  {},
])("rejects a continuing page that lacks a fresh cursor", (metadata) =>
  Effect.gen(function* () {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json({
          items: [],
          pagination: { hasMore: true, ...metadata },
        }),
      ),
    );
    const error = yield* ManagementClient.make(token, { fetch })
      .streamCustomRoles(17, { cursor: privateDetail })
      .pipe(Stream.runDrain, Effect.flip);
    expect(error).toBeInstanceOf(PlatformError.InvalidPagination);
    expect(error.operation).toBe("listCustomRoles");
    expect(String(error)).not.toContain(privateDetail);
    expect(fetch).toHaveBeenCalledTimes(1);
  }),
);

it.effect(
  "redacts every minted credential and revokes keys and tokens without manual unwrapping",
  () =>
    Effect.gen(function* () {
      const fetch = vi
        .fn<NonNullable<ManagementClient.Options["fetch"]>>(() =>
          Promise.resolve(new Response(null)),
        )
        .mockResolvedValueOnce(Response.json({ token: privateDetail }))
        .mockResolvedValueOnce(Response.json({ deployKey: privateDetail }))
        .mockResolvedValueOnce(
          Response.json({ previewDeployKey: privateDetail }),
        )
        .mockResolvedValueOnce(Response.json({ accessToken: privateDetail }))
        .mockResolvedValueOnce(
          Response.json(
            { accessToken: privateDetail, tokenType: "team" },
            { status: 201 },
          ),
        );
      const client = ManagementClient.make(token, { fetch });
      const jwt = yield* client.mintAiGatewayJwt("test-deployment", {
        attribution: {},
      });
      const key = yield* client.createDeployKey("test-deployment", {
        name: "ci",
      });
      const preview = yield* client.createPreviewDeployKey(7, {
        name: "preview",
      });
      const personal = yield* client.createPersonalAccessToken({ name: "ci" });
      const team = yield* client.createTeamAccessToken(17);
      expect(team.tokenType).toBe("team");
      const [
        [mint],
        [create],
        [createPreview],
        [createPersonal],
        [createTeamToken],
      ] = fetch.mock.calls;
      expect(new URL(mint.url).pathname).toBe(
        "/v1/deployments/test-deployment/mint_ai_gateway_jwt",
      );
      expect(new URL(create.url).pathname).toBe(
        "/v1/deployments/test-deployment/create_deploy_key",
      );
      expect(new URL(createPreview.url).pathname).toBe(
        "/v1/projects/7/create_preview_deploy_key",
      );
      expect(new URL(createPersonal.url).pathname).toBe(
        "/v1/create_personal_access_token",
      );
      expect(new URL(createTeamToken.url).pathname).toBe(
        "/v1/teams/17/create_access_token",
      );
      expect(createTeamToken.body).toBeNull();
      for (const secret of [
        jwt.token,
        key.deployKey,
        preview.previewDeployKey,
        personal.accessToken,
        team.accessToken,
      ]) {
        expect(Redacted.value(secret)).toBe(privateDetail);
        expect(Inspectable.toStringUnknown(secret)).not.toContain(
          privateDetail,
        );
      }
      yield* client.deleteDeployKey("test-deployment", { id: key.deployKey });
      yield* client.deletePreviewDeployKey(7, { id: preview.previewDeployKey });
      yield* client.deletePersonalAccessToken({ id: personal.accessToken });
      yield* client.deleteTeamAccessToken(17, { id: team.accessToken });
      yield* client.deleteDeployKey("test-deployment", { id: "ci" });
      expect(fetch).toHaveBeenCalledTimes(10);
      for (const [index, [request]] of fetch.mock.calls.slice(5).entries()) {
        const body: unknown = yield* Effect.promise(() => request.json());
        expect(body).toEqual({ id: index < 4 ? privateDetail : "ci" });
      }
    }),
);

it.effect("reveals revocation credentials only when the request executes", () =>
  Effect.gen(function* () {
    const fetch = vi.fn(() => Promise.resolve(new Response(null)));
    const client = ManagementClient.make(token, { fetch });
    const id = Redacted.make(privateDetail);
    const deletion = client.deleteDeployKey("example", { id });
    Redacted.wipeUnsafe(id);
    const error = yield* deletion.pipe(Effect.flip);
    expect(error).toBeInstanceOf(PlatformError.InvalidRequest);
    expect(fetch).not.toHaveBeenCalled();
  }),
);

it.effect(
  "writes redacted and plain default variables without changing the inputs or deletion semantics",
  () =>
    Effect.gen(function* () {
      const fetch = vi.fn((_request: Request) =>
        Promise.resolve(new Response(null)),
      );
      const client = ManagementClient.make(token, { fetch });
      const value = Redacted.make(privateDetail);
      const changes = [
        { name: "SECRET", deploymentType: "prod", value },
        { name: "PLAIN", deploymentType: "dev", value: "" },
        { name: "OMIT", deploymentType: "preview" },
        { name: "DELETE", deploymentType: "custom", value: null },
      ] as const;
      yield* client.updateDefaultEnvironmentVariables(7, { changes });
      const [[request]] = fetch.mock.calls;
      const body: unknown = yield* Effect.promise(() => request.json());
      expect(body).toEqual({
        changes: [
          { ...changes[0], value: privateDetail },
          changes[1],
          changes[2],
          changes[3],
        ],
      });
      expect(changes[0].value).toBe(value);
    }),
);

it.effect(
  "reads new deploy-key permissions without relaxing permission writes",
  () =>
    Effect.gen(function* () {
      const metadata = {
        id: 4,
        name: "ci",
        creationTime: 42,
        allowedActions: ["deployment:future-read-action"],
      };
      const fetch = vi
        .fn<NonNullable<ManagementClient.Options["fetch"]>>()
        .mockResolvedValueOnce(Response.json([metadata]))
        .mockResolvedValueOnce(Response.json({ items: [metadata] }))
        .mockResolvedValueOnce(
          Response.json([{ ...metadata, allowedActions: [12] }]),
        );
      const client = ManagementClient.make(token, { fetch });
      const keys = yield* client.listDeployKeys("example");
      expectTypeOf(keys[0].allowedActions).toEqualTypeOf<
        ReadonlyArray<string>
      >();
      expect(keys).toEqual([metadata]);
      const previews = yield* client.listPreviewDeployKeys(7);
      expect(previews.items).toEqual(keys);
      const invalid = yield* client.listDeployKeys("example").pipe(Effect.flip);
      expect(invalid).toMatchObject({
        _tag: "InvalidResponse",
        operation: "listDeployKeys",
        status: 200,
      });
    }),
);

it.effect(
  "redacts project default environment variables without inventing cursor support",
  () =>
    Effect.gen(function* () {
      const pagination = { hasMore: false };
      const fetch = vi.fn(() =>
        Promise.resolve(
          Response.json({
            items: [
              {
                name: "API_KEY",
                value: privateDetail,
                deploymentTypes: ["prod"],
              },
            ],
            pagination,
          }),
        ),
      );
      const client = ManagementClient.make(token, { fetch });
      const page = yield* client.listDefaultEnvironmentVariables(7, {
        deploymentType: "prod",
      });
      expect(page.pagination).toEqual(pagination);
      const [item] = page.items;
      expect(item.name).toBe("API_KEY");
      expect(item.deploymentTypes).toEqual(["prod"]);
      expect(Redacted.value(item.value)).toBe(privateDetail);
      expect(Inspectable.toStringUnknown(item.value)).not.toContain(
        privateDetail,
      );
      expect(client).not.toHaveProperty("streamDefaultEnvironmentVariables");
    }),
);

it.effect.each([400, 403, 500])(
  "classifies documented creation errors only on their own operations (%i)",
  (status) =>
    Effect.gen(function* () {
      const client = ManagementClient.make(token, {
        fetch: () => Promise.resolve(new Response(privateDetail, { status })),
      });
      const team = yield* client
        .createTeam({ name: "team", defaultRegion: "aws-us-east-1" })
        .pipe(Effect.flip);
      expect(team).toMatchObject({
        operation: "createTeam",
        status,
        _tag:
          status === 400
            ? "InvalidTeamConfiguration"
            : status === 403
              ? "TeamCreationForbidden"
              : "HttpError",
      });
      const accessToken = yield* client
        .createTeamAccessToken(17)
        .pipe(Effect.flip);
      expect(accessToken).toMatchObject({
        operation: "createTeamAccessToken",
        status,
        _tag: status === 403 ? "TeamAccessTokenForbidden" : "HttpError",
      });
      const projectError = yield* client
        .createProject(17, { projectName: "project" })
        .pipe(Effect.flip);
      expect(projectError).toMatchObject({
        operation: "createProject",
        status,
        _tag: "HttpError",
      });
    }),
);

it.effect(
  "sends built-in and custom role assignments in their distinct wire forms",
  () =>
    Effect.gen(function* () {
      const fetch = vi.fn((_request: Request) =>
        Promise.resolve(new Response(null)),
      );
      const client = ManagementClient.make(token, { fetch });
      const customRoles = [41, 42] as const;
      const email = "member@example.test";
      yield* client.inviteTeamMember(1, { email, role: "custom", customRoles });
      yield* client.inviteTeamMember(1, { email, role: "developer" });
      yield* client.updateTeamMemberRole(1, { memberId: 7, customRoles });
      yield* client.updateTeamMemberRole(1, { memberId: 7, role: "admin" });
      const bodies = yield* Effect.forEach(
        fetch.mock.calls,
        ([request]) => Effect.promise((): Promise<unknown> => request.json()),
        { concurrency: 1 },
      );
      expect(bodies).toEqual([
        { email, role: "custom", customRoles: [41, 42] },
        { email, role: "developer" },
        { memberId: 7, customRoles: [41, 42] },
        { memberId: 7, role: "admin" },
      ]);
    }),
);

it("rules out conflicting roles and non-defaultable deployment types", () => {
  type Invite = Parameters<ManagementClient.Service["inviteTeamMember"]>[1];
  type Update = Parameters<ManagementClient.Service["updateTeamMemberRole"]>[1];
  type Create = Parameters<ManagementClient.Service["createDeployment"]>[1];
  const email = "member@example.test";
  const memberId = 7;
  expectTypeOf({ email, role: "custom" } as const).not.toExtend<Invite>();
  expectTypeOf({
    email,
    role: "custom",
    customRoles: [],
  } as const).not.toExtend<Invite>();
  expectTypeOf({
    email,
    role: "admin",
    customRoles: [1],
  } as const).not.toExtend<Invite>();
  expectTypeOf({
    memberId,
    role: "developer",
    customRoles: [1],
  } as const).not.toExtend<Update>();
  expectTypeOf({ memberId, role: "custom" } as const).not.toExtend<Update>();
  expectTypeOf({ memberId, customRoles: [] } as const).not.toExtend<Update>();
  expectTypeOf({ memberId }).not.toExtend<Update>();
  expectTypeOf({
    type: "preview",
    isDefault: false,
  } as const).not.toExtend<Create>();
  expectTypeOf({
    type: "custom",
    isDefault: true,
  } as const).not.toExtend<Create>();
  expectTypeOf({ type: "dev", isDefault: true } as const).toExtend<Create>();
  expectTypeOf({ type: "prod", isDefault: false } as const).toExtend<Create>();
  expectTypeOf<{
    type: ManagementApi.CreateDeploymentType;
    reference: string;
  }>().toExtend<Create>();
});

it("requires each named operation's inputs and exposes only its own error types", () => {
  type CreateTeamResponses =
    ManagementApi.operations["create team"]["responses"];
  type CreateTokenResponses =
    ManagementApi.operations["create team access token"]["responses"];
  expectTypeOf<Exclude<keyof CreateTeamResponses, 201>>().toEqualTypeOf<
    400 | 403
  >();
  expectTypeOf<Exclude<keyof CreateTokenResponses, 201>>().toEqualTypeOf<403>();
  expectTypeOf<CreateTeamResponses[400 | 403]["content"]>().toBeUndefined();
  expectTypeOf<CreateTokenResponses[403]["content"]>().toBeUndefined();
  const check = (client: ReturnType<typeof ManagementClient.make>) => {
    const tokenRequest = client.createTeamAccessToken(17);
    expectTypeOf<Effect.Success<typeof tokenRequest>>().toEqualTypeOf<{
      accessToken: Redacted.Redacted<string>;
      tokenType: string;
    }>();
    expectTypeOf<Effect.Error<typeof tokenRequest>>().toEqualTypeOf<
      PlatformError.RequestFailure | PlatformError.TeamAccessTokenForbidden
    >();
    expectTypeOf(client.createTeamAccessToken(17, null)).toEqualTypeOf<
      typeof tokenRequest
    >();
    expectTypeOf<
      Effect.Error<ReturnType<typeof client.createTeam>>
    >().toEqualTypeOf<
      | PlatformError.RequestFailure
      | PlatformError.InvalidTeamConfiguration
      | PlatformError.TeamCreationForbidden
    >();
    // @ts-expect-error An audit query needs both its path and query parameters.
    expectTypeOf(client.listAuditLogEvents(17));
    // @ts-expect-error The end of the time range is required.
    expectTypeOf(client.streamAuditLogEvents(17, { from: 1 }));
    // @ts-expect-error The audit operation expects a numeric team ID.
    expectTypeOf(client.listAuditLogEvents("17", { from: 1, to: 2 }));
    // @ts-expect-error Selecting a project for creation requires a body.
    expectTypeOf(client.createProject(17));
    expectTypeOf(
      client.createDeployKey("example", {
        name: "ci",
        // @ts-expect-error Unknown scopes may appear in metadata but aren't accepted in writes.
        allowedActions: ["deployment:future-read-action"],
      }),
    );
    expectTypeOf(
      client.createProject(17, {
        projectName: "project",
        // @ts-expect-error Provisioning accepts only deployment types known to the SDK.
        deploymentType: "other",
      }),
    );
    // @ts-expect-error Deployment endpoints do not belong to the management client.
    expectTypeOf(client.getDeploymentInfo());
    // @ts-expect-error The transport is not public.
    expectTypeOf(client.request("post", "/token_details"));
    expectTypeOf(
      // @ts-expect-error This endpoint returns pagination metadata but accepts no cursor.
      client.listDefaultEnvironmentVariables(7, { cursor: "start" }),
    );
  };
  expectTypeOf(check).toBeFunction();
});
