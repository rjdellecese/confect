import * as ConvexClient from "@confect/alchemy/ConvexClient";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { inspect } from "node:util";

const token = Redacted.make("management-secret-for-tests");
const deployKey = Redacted.make("deployment-secret-for-tests");
const clientLayer = ConvexClient.layer({ token });
const deploymentUrl = "https://happy-otter-123.eu-west-1.convex.cloud";

const project = {
  id: 42,
  teamId: 7,
  name: "Example",
  slug: "example",
  teamSlug: "team",
  createTime: 100,
} satisfies ConvexClient.Project;

const deployment = {
  kind: "cloud",
  id: 43,
  name: "happy-otter-123",
  projectId: 42,
  deploymentType: "custom",
  region: "aws-eu-west-1",
  class: "s16",
  isDefault: false,
  reference: "branch/main",
  createTime: 100,
  deploymentUrl,
} satisfies ConvexClient.Deployment;

const mockHttp = (responses: readonly Response[]) => {
  const requests: HttpClientRequest.HttpClientRequest[] = [];
  const client = HttpClient.make((request) => {
    const response = responses[requests.length];
    requests.push(request);
    return response === undefined
      ? Effect.die("Unexpected HTTP request")
      : Effect.succeed(HttpClientResponse.fromWeb(request, response));
  });
  return { requests, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

const requestBody = (
  request: HttpClientRequest.HttpClientRequest | undefined,
): unknown => {
  if (request?.body._tag !== "Uint8Array") return undefined;
  return JSON.parse(new TextDecoder().decode(request.body.body));
};

const expectSecretSafe = (value: unknown, secret: string) => {
  expect(JSON.stringify(value)).not.toContain(secret);
  expect(String(value)).not.toContain(secret);
  expect(inspect(value)).not.toContain(secret);
};

describe("ConvexClient", () => {
  it.effect(
    "paginates all projects and authenticates management requests",
    () => {
      const secondProject = { ...project, id: 41 };
      const http = mockHttp([
        Response.json({
          items: [project],
          pagination: { hasMore: true, nextCursor: "next/+" },
        }),
        Response.json({
          items: [secondProject],
          pagination: { hasMore: false },
        }),
      ]);
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        expect(yield* client.listProjects(7)).toEqual([project, secondProject]);
        expect(http.requests.map((request) => request.url)).toEqual([
          "https://api.convex.dev/v1/teams/7/projects",
          "https://api.convex.dev/v1/teams/7/projects?cursor=next%2F%2B",
        ]);
        for (const request of http.requests) {
          expect(request.method).toBe("GET");
          expect(request.headers.authorization).toBe(
            `Bearer ${Redacted.value(token)}`,
          );
        }
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect("rejects incomplete and repeated pagination cursors", () => {
    const http = mockHttp([
      Response.json({ items: [], pagination: { hasMore: true } }),
      Response.json({
        items: [],
        pagination: { hasMore: true, nextCursor: "same" },
      }),
      Response.json({
        items: [],
        pagination: { hasMore: true, nextCursor: "same" },
      }),
    ]);
    return Effect.gen(function* () {
      const client = yield* ConvexClient.ConvexClient;
      expect(yield* client.listProjects(7).pipe(Effect.flip)).toMatchObject({
        code: "InvalidPagination",
      });
      expect(yield* client.listProjects(7).pipe(Effect.flip)).toMatchObject({
        code: "InvalidPagination",
      });
      expect(http.requests).toHaveLength(3);
    }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
  });

  it.effect(
    "uses the official project create, get, patch, and delete contracts",
    () => {
      const created = { id: 42, projectId: 42, slug: "example" };
      const http = mockHttp([
        Response.json(created),
        Response.json(project),
        Response.json({ ...project, name: "Renamed" }),
        new Response(null, { status: 200 }),
      ]);
      const createInput = { projectName: "Example" };
      const updateInput = { name: "Renamed" };
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        expect(yield* client.createProject(7, createInput)).toEqual(created);
        expect(yield* client.getProject(42)).toEqual(project);
        expect(yield* client.updateProject(42, updateInput)).toEqual({
          ...project,
          name: "Renamed",
        });
        expect(yield* client.deleteProject(42)).toBeUndefined();
        expect(http.requests.map(({ method, url }) => [method, url])).toEqual([
          ["POST", "https://api.convex.dev/v1/teams/7/create_project"],
          ["GET", "https://api.convex.dev/v1/projects/42"],
          ["PATCH", "https://api.convex.dev/v1/projects/42"],
          ["POST", "https://api.convex.dev/v1/projects/42/delete"],
        ]);
        expect(requestBody(http.requests[0])).toEqual(createInput);
        expect(requestBody(http.requests[2])).toEqual(updateInput);
        expect(createInput).toEqual({ projectName: "Example" });
        expect(updateInput).toEqual({ name: "Renamed" });
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect(
    "uses deployment endpoints and validates cloud and local responses",
    () => {
      const local = {
        kind: "local",
        name: "local-instance",
        createTime: 100,
        deploymentType: "dev",
        projectId: 42,
        creator: 1,
        port: 3210,
        deviceName: "laptop",
        isActive: true,
      } satisfies ConvexClient.Deployment;
      const http = mockHttp([
        Response.json([deployment, local]),
        Response.json(deployment),
        Response.json(deployment),
        new Response(null, { status: 200 }),
        new Response(null, { status: 204 }),
      ]);
      const input = {
        type: "custom",
        reference: "branch/main",
        region: "aws-eu-west-1",
        class: "s16",
      } satisfies ConvexClient.CreateDeploymentInput;
      const update = {
        reference: "branch/next",
        expiresAt: null,
        sendLogsToClient: false,
      };
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        expect(yield* client.listDeployments(42)).toEqual([deployment, local]);
        expect(yield* client.getDeployment("name/with slash")).toEqual(
          deployment,
        );
        expect(yield* client.createDeployment(42, input)).toEqual(deployment);
        expect(
          yield* client.updateDeployment(deployment.name, update),
        ).toBeUndefined();
        expect(yield* client.deleteDeployment(deployment.name)).toBeUndefined();
        expect(http.requests.map(({ method, url }) => [method, url])).toEqual([
          ["GET", "https://api.convex.dev/v1/projects/42/list_deployments"],
          ["GET", "https://api.convex.dev/v1/deployments/name%2Fwith%20slash"],
          ["POST", "https://api.convex.dev/v1/projects/42/create_deployment"],
          ["PATCH", "https://api.convex.dev/v1/deployments/happy-otter-123"],
          [
            "POST",
            "https://api.convex.dev/v1/deployments/happy-otter-123/delete",
          ],
        ]);
        expect(requestBody(http.requests[2])).toEqual(input);
        expect(requestBody(http.requests[3])).toEqual(update);
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect(
    "redacts created deploy keys and preserves safe key metadata",
    () => {
      const key = {
        id: 5,
        name: "automation",
        creationTime: 100,
        allowedActions: [
          "deployment:env:view",
          "deployment:aiGateway:use",
          "deployment:future:action",
        ],
      };
      const http = mockHttp([
        Response.json({ deployKey: Redacted.value(deployKey) }),
        Response.json([key]),
        new Response(null, { status: 200 }),
        new Response(null, { status: 200 }),
      ]);
      const input = {
        name: "automation",
        allowedActions: ["deployment:env:view"],
      } satisfies ConvexClient.CreateDeployKeyInput;
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        const created = yield* client.createDeployKey(deployment.name, input);
        expect(Redacted.value(created.deployKey)).toBe(
          Redacted.value(deployKey),
        );
        expectSecretSafe(created, Redacted.value(deployKey));
        expect(yield* client.listDeployKeys(deployment.name)).toEqual([key]);
        yield* client.deleteDeployKey(deployment.name, created.deployKey);
        yield* client.deleteDeployKey(deployment.name, key.name);
        expect(http.requests.map(({ url }) => url)).toEqual([
          "https://api.convex.dev/v1/deployments/happy-otter-123/create_deploy_key",
          "https://api.convex.dev/v1/deployments/happy-otter-123/list_deploy_keys",
          "https://api.convex.dev/v1/deployments/happy-otter-123/delete_deploy_key",
          "https://api.convex.dev/v1/deployments/happy-otter-123/delete_deploy_key",
        ]);
        expect(requestBody(http.requests[0])).toEqual(input);
        expect(requestBody(http.requests[2])).toEqual({
          id: Redacted.value(created.deployKey),
        });
        expect(requestBody(http.requests[3])).toEqual({ id: "automation" });
        expectSecretSafe(created, Redacted.value(deployKey));
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect("does not expose the revoked token when revocation fails", () => {
    const http = mockHttp([
      Response.json({ message: Redacted.value(deployKey) }, { status: 500 }),
    ]);
    return Effect.gen(function* () {
      const client = yield* ConvexClient.ConvexClient;
      const error = yield* client
        .deleteDeployKey(deployment.name, deployKey)
        .pipe(Effect.flip);
      expect(requestBody(http.requests[0])).toEqual({
        id: Redacted.value(deployKey),
      });
      expect(error).toMatchObject({
        operation: "deleteDeployKey",
        status: 500,
        code: "HttpError",
      });
      expectSecretSafe(error, Redacted.value(deployKey));
      expect(http.requests).toHaveLength(1);
    }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
  });

  it.effect(
    "uses deployment authentication and redacts environment values without a management token",
    () => {
      const secret = "environment-secret-for-tests";
      const http = mockHttp([
        Response.json({ environmentVariables: { API_KEY: secret, EMPTY: "" } }),
        new Response(null, { status: 200 }),
      ]);
      const changes = [
        { name: "API_KEY", value: Redacted.make(secret) },
        { name: "PLAIN", value: "plain" },
        { name: "REMOVE" },
        { name: "NULL_REMOVE", value: null },
      ];
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        const values = yield* client.listEnvironmentVariables(
          `${deploymentUrl}/`,
          deployKey,
        );
        const apiKey = values.API_KEY;
        const empty = values.EMPTY;
        if (apiKey === undefined || empty === undefined)
          return yield* Effect.die("Missing environment variables");
        expect(Redacted.value(apiKey)).toBe(secret);
        expect(Redacted.value(empty)).toBe("");
        expectSecretSafe(values, secret);
        yield* client.updateEnvironmentVariables(
          deploymentUrl,
          deployKey,
          changes,
        );
        expect(http.requests.map(({ url }) => url)).toEqual([
          `${deploymentUrl}/api/v1/list_environment_variables`,
          `${deploymentUrl}/api/v1/update_environment_variables`,
        ]);
        for (const request of http.requests) {
          expect(request.headers.authorization).toBe(
            `Convex ${Redacted.value(deployKey)}`,
          );
        }
        expect(requestBody(http.requests[1])).toEqual({
          changes: [
            { name: "API_KEY", value: secret },
            { name: "PLAIN", value: "plain" },
            { name: "REMOVE" },
            { name: "NULL_REMOVE", value: null },
          ],
        });
        expect(changes).toEqual([
          { name: "API_KEY", value: Redacted.make(secret) },
          { name: "PLAIN", value: "plain" },
          { name: "REMOVE" },
          { name: "NULL_REMOVE", value: null },
        ]);
      }).pipe(
        Effect.provide([
          ConvexClient.layer().pipe(Layer.provide(http.layer)),
          ConfigProvider.layer(ConfigProvider.fromUnknown({})),
        ]),
      );
    },
  );

  it.effect("loads management credentials lazily from Config", () => {
    const http = mockHttp([Response.json(project)]);
    return Effect.gen(function* () {
      const client = yield* ConvexClient.ConvexClient;
      yield* client.getProject(42);
      expect(http.requests[0]?.headers.authorization).toBe(
        "Bearer config-token",
      );
    }).pipe(
      Effect.provide([
        ConvexClient.layer().pipe(Layer.provide(http.layer)),
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ CONVEX_ACCESS_TOKEN: "config-token" }),
        ),
      ]),
    );
  });

  it.effect(
    "fails with a sanitized configuration error only when management credentials are needed",
    () => {
      const http = mockHttp([]);
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        expect(yield* client.getProject(42).pipe(Effect.flip)).toMatchObject({
          _tag: "ConvexApiError",
          code: "InvalidConfiguration",
        });
        expect(http.requests).toHaveLength(0);
      }).pipe(
        Effect.provide([
          ConvexClient.layer().pipe(Layer.provide(http.layer)),
          ConfigProvider.layer(ConfigProvider.fromUnknown({})),
        ]),
      );
    },
  );

  it.effect(
    "rejects unsafe deployment targets before transmitting keys",
    () => {
      const http = mockHttp([]);
      const urls = [
        "http://happy-otter-123.convex.cloud",
        "https://secret@happy-otter-123.convex.cloud",
        "https://happy-otter-123.convex.cloud/?secret=value",
        "https://happy-otter-123.convex.cloud/#secret",
        "https://happy-otter-123.convex.cloud/path",
        "https://happy-otter-123.convex.cloud:444",
        "https://happy-otter-123.convex.cloud.attacker.example",
        "https://attacker.example",
        "not a URL",
      ];
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        for (const url of urls) {
          const readError = yield* client
            .listEnvironmentVariables(url, deployKey)
            .pipe(Effect.flip);
          const writeError = yield* client
            .updateEnvironmentVariables(url, deployKey, [])
            .pipe(Effect.flip);
          expect(readError).toMatchObject({ code: "InvalidRequest" });
          expect(writeError).toMatchObject({ code: "InvalidRequest" });
          expectSecretSafe(readError, url);
          expectSecretSafe(writeError, Redacted.value(deployKey));
        }
        expect(http.requests).toHaveLength(0);
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect(
    "classifies status failures without retaining bodies or retrying mutations",
    () => {
      const secret = "untrusted-error-body-secret";
      const http = mockHttp(
        [404, 409, 401, 429, 500, 302].map((status) =>
          Response.json({ code: secret, message: secret }, { status }),
        ),
      );
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        for (const [status, tag] of [
          [404, "ConvexNotFound"],
          [409, "ConvexConflict"],
          [401, "ConvexApiError"],
          [429, "ConvexApiError"],
          [500, "ConvexApiError"],
          [302, "ConvexApiError"],
        ]) {
          const error = yield* client
            .createProject(7, { projectName: "Example" })
            .pipe(Effect.flip);
          expect(error).toMatchObject({
            _tag: tag,
            status,
            operation: "createProject",
            code: "HttpError",
          });
          expectSecretSafe(error, secret);
          expectSecretSafe(error, Redacted.value(token));
        }
        expect(http.requests).toHaveLength(6);
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect(
    "keeps missing reads and deletes in the typed not-found channel",
    () => {
      const http = mockHttp(
        Array.from({ length: 4 }, () => new Response(null, { status: 404 })),
      );
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        for (const operation of [
          client.getProject(42).pipe(Effect.asVoid),
          client.deleteProject(42),
          client.getDeployment(deployment.name).pipe(Effect.asVoid),
          client.deleteDeployment(deployment.name),
        ]) {
          expect(yield* operation.pipe(Effect.flip)).toBeInstanceOf(
            ConvexClient.ConvexNotFound,
          );
        }
      }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
    },
  );

  it.effect("sanitizes malformed JSON and response validation failures", () => {
    const secret = "malformed-response-secret";
    const http = mockHttp([
      new Response(secret),
      Response.json({ ...project, id: secret }),
      Response.json({ deployKey: { secret } }),
      Response.json({ environmentVariables: { SECRET: { secret } } }),
    ]);
    return Effect.gen(function* () {
      const client = yield* ConvexClient.ConvexClient;
      for (const operation of [
        client.getProject(42).pipe(Effect.asVoid),
        client.getProject(42).pipe(Effect.asVoid),
        client
          .createDeployKey(deployment.name, { name: "automation" })
          .pipe(Effect.asVoid),
        client
          .listEnvironmentVariables(deploymentUrl, deployKey)
          .pipe(Effect.asVoid),
      ]) {
        const error = yield* operation.pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "ConvexApiError",
          status: 200,
          code: "InvalidResponse",
        });
        expectSecretSafe(error, secret);
      }
    }).pipe(Effect.provide(clientLayer.pipe(Layer.provide(http.layer))));
  });

  it.effect(
    "sanitizes transport errors that include credentials and requests",
    () => {
      const secret = "network-secret";
      const transport = HttpClient.make((request) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause: { secret },
            }),
          }),
        ),
      );
      return Effect.gen(function* () {
        const client = yield* ConvexClient.ConvexClient;
        const error = yield* client.getProject(42).pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "ConvexApiError",
          code: "TransportError",
        });
        expectSecretSafe(error, secret);
        expectSecretSafe(error, Redacted.value(token));
      }).pipe(
        Effect.provide(
          clientLayer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, transport)),
          ),
        ),
      );
    },
  );

  it.effect("disables automatic redirects on the Fetch transport", () => {
    const requests: (RequestInit | undefined)[] = [];
    const fetch: typeof globalThis.fetch = Object.assign(
      (...[_input, init]: Parameters<typeof globalThis.fetch>) => {
        requests.push(init);
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://attacker.example" },
          }),
        );
      },
      { preconnect: () => undefined },
    );
    return Effect.gen(function* () {
      const client = yield* ConvexClient.ConvexClient;
      const error = yield* client
        .listEnvironmentVariables(deploymentUrl, deployKey)
        .pipe(Effect.flip);
      expect(error).toMatchObject({ code: "HttpError", status: 302 });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.redirect).toBe("manual");
    }).pipe(
      Effect.provide(clientLayer.pipe(Layer.provide(FetchHttpClient.layer))),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );
  });
});
