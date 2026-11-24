import { Convex } from "@confect/alchemy";
import { it, expect } from "@effect/vitest";
import { adopt } from "alchemy/AdoptPolicy";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { identity } from "effect/Function";
import * as Exit from "effect/Exit";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { stackFixture, failureOf } from "./StackFixture.js";

const name = "wise-horse-42";
const url = `https://${name}.ca-central-1.convex.cloud`;
const key = `prod:${name}|synthetic-value`;
const token = "test-only-management-token";
const KeyRequest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    allowedActions: Schema.String.pipe(Schema.Array, Schema.optionalKey),
  }),
);
const project = {
  name: "Notes",
  id: 12,
  slug: "notes",
  teamId: 5,
  teamSlug: "workspace",
  createTime: 7,
};
const deployment = {
  kind: "cloud",
  deploymentType: "prod",
  name,
  id: 21,
  projectId: 12,
  createTime: 15,
  reference: "production-notes",
  region: "aws-ca-central-1",
  isDefault: false,
  deploymentUrl: url,
  class: "s16",
};

const api = () => {
  const log: string[] = [];
  const projects = [project];
  const deployments = [deployment];
  let keys: Array<{
    id: number;
    name: string;
    allowedActions: ReadonlyArray<string>;
    creationTime: number;
  }> = [];
  const fetch = Effect.fn(function* (request: Request) {
    const target = new URL(request.url);
    expect(target.origin).toBe("https://api.convex.dev");
    expect(request.headers.get("Authorization")).toBe(`Bearer ${token}`);
    if (request.method !== "GET") log.push(target.pathname);
    switch (target.pathname) {
      case "/v1/teams/5/projects":
        return Response.json({
          items: projects,
          pagination: { hasMore: false },
        });
      case "/v1/teams/5/create_project": {
        const text = yield* Effect.promise(() => request.text());
        expect(text).toContain('"projectName":"Notes"');
        projects.push(project);
        return Response.json({ projectId: 12, id: 12, slug: "notes" });
      }
      case "/v1/projects/12":
        return projects.length > 0
          ? Response.json(project)
          : new Response(null, { status: 404 });
      case "/v1/projects/12/list_deployments":
        return Response.json(deployments);
      case "/v1/projects/12/create_deployment": {
        const body: unknown = yield* Effect.promise(() => request.json());
        expect(body).toEqual({
          type: "prod",
          reference: "production-notes",
          region: "aws-ca-central-1",
        });
        deployments.push(deployment);
        return Response.json(deployment);
      }
      case `/v1/deployments/${name}`:
        return deployments.length > 0
          ? Response.json(deployment)
          : new Response(null, { status: 404 });
      case `/v1/deployments/${name}/list_deploy_keys`:
        return Response.json(keys);
      case `/v1/deployments/${name}/create_deploy_key`: {
        const { name: keyName, allowedActions } = yield* Effect.promise(() =>
          request.text(),
        ).pipe(Effect.flatMap(Schema.decodeEffect(KeyRequest)));
        keys = [
          {
            id: 61,
            name: keyName,
            allowedActions: allowedActions ?? [],
            creationTime: 12,
          },
        ];
        return Response.json({ deployKey: key });
      }
      case `/v1/deployments/${name}/delete_deploy_key`: {
        const body: unknown = yield* Effect.promise(() => request.json());
        expect(body).toEqual({ id: key });
        keys = [];
        return new Response(null);
      }
      case `/v1/deployments/${name}/delete`:
        deployments.length = 0;
        return new Response(null);
      case "/v1/projects/12/delete":
        projects.length = 0;
        return new Response(null);
      default:
        return new Response("private response body", { status: 500 });
    }
  });
  return {
    projects,
    deployments,
    log,
    fetch,
    forgetKey: () => {
      keys = [];
    },
  };
};

const provision = (destroy = false) =>
  Effect.gen(function* () {
    const removal = destroy ? RemovalPolicy.destroy() : identity;
    const p = yield* Convex.Project("Project", {
      teamId: 5,
      name: "Notes",
    }).pipe(removal);
    const d = yield* Convex.Deployment("Deployment", {
      projectId: p.projectId,
      type: "prod",
      reference: "production-notes",
      region: "aws-ca-central-1",
    }).pipe(removal);
    yield* Convex.DeployKey("Key", {
      deploymentName: d.name,
      name: "writer",
      allowedActions: ["deployment:deploy"],
    });
    return d.url;
  });

it.effect(
  "provisions linked cloud resources with a scoped transport, revokes the key, and retains data",
  () =>
    Effect.gen(function* () {
      const cloud = api();
      cloud.projects.length = 0;
      cloud.deployments.length = 0;
      const fixture = stackFixture({
        config: { CONVEX_ACCESS_TOKEN: token },
        fetch: cloud.fetch,
      });
      yield* fixture.plan(provision());
      expect(cloud.log).toEqual([]);
      const output = yield* fixture.deploy(provision());
      expect(output).toBe(url);
      expect(cloud.log).toEqual([
        "/v1/teams/5/create_project",
        "/v1/projects/12/create_deployment",
        `/v1/deployments/${name}/create_deploy_key`,
      ]);
      yield* fixture.deploy(provision());
      expect(cloud.log).toHaveLength(3);
      yield* fixture.deploy(Effect.void);
      expect(cloud.projects).toHaveLength(1);
      expect(cloud.deployments).toHaveLength(1);
      expect(cloud.log.at(-1)).toBe(
        `/v1/deployments/${name}/delete_deploy_key`,
      );
      const rejected = yield* Effect.exit(fixture.plan(provision()));
      expect(Exit.isFailure(rejected)).toBe(true);
      yield* fixture.deploy(provision(true).pipe(adopt()));
      yield* fixture.deploy(Effect.void);
      expect(cloud.log.slice(-3)).toEqual([
        `/v1/deployments/${name}/delete_deploy_key`,
        `/v1/deployments/${name}/delete`,
        "/v1/projects/12/delete",
      ]);
    }),
);

it.effect(
  "does not fetch another project page after the registered provider finds a duplicate",
  () =>
    Effect.gen(function* () {
      const cursors: (string | null)[] = [];
      const fixture = stackFixture({
        token: Redacted.make(token),
        fetch: (request) =>
          Effect.sync(() => {
            const cursor = new URL(request.url).searchParams.get("cursor");
            cursors.push(cursor);
            if (cursor !== null) return new Response(null, { status: 500 });
            return Response.json({
              items: [project, { ...project, id: 13 }],
              pagination: { hasMore: true, nextCursor: "unused" },
            });
          }),
      });
      const message = yield* failureOf(
        fixture.plan(
          Convex.Project("Project", {
            teamId: project.teamId,
            name: project.name,
          }).pipe(Effect.asVoid),
        ),
      );
      expect(message).toContain("More than one project");
      expect(cursors).toEqual([null]);
    }),
);

it.effect(
  "refuses ambiguous discovery and identity changes without modifying existing infrastructure",
  () =>
    Effect.gen(function* () {
      const cloud = api();
      const fixture = stackFixture({
        token: Redacted.make(token),
        fetch: cloud.fetch,
      });
      const p = (teamId: number) =>
        Convex.Project("Project", { teamId, name: "Notes" }).pipe(
          adopt(),
          Effect.asVoid,
        );
      cloud.projects.push({ ...project, id: 13 });
      const ambiguous = yield* failureOf(fixture.plan(p(5)));
      expect(ambiguous).toContain("More than one");
      cloud.projects.pop();
      yield* fixture.deploy(p(5));
      const moved = yield* failureOf(fixture.plan(p(6)));
      expect(moved).toContain("teamId");
      yield* fixture.deploy(provision().pipe(adopt()));
      const changed = (
        projectId: number,
        type: "prod" | "dev",
        region: "aws-ca-central-1" | "aws-us-east-1",
      ) =>
        Convex.Deployment("Deployment", {
          projectId,
          type,
          region,
          reference: "production-notes",
        }).pipe(Effect.asVoid);
      for (const run of [
        changed(13, "prod", "aws-ca-central-1"),
        changed(12, "dev", "aws-ca-central-1"),
        changed(12, "prod", "aws-us-east-1"),
      ]) {
        const message = yield* failureOf(fixture.plan(run));
        expect(message).toContain("conflicting");
      }
      expect(cloud.log).toEqual([`/v1/deployments/${name}/create_deploy_key`]);
    }),
);

it.effect(
  "requires a new key resource instead of replacing credentials on a prop change",
  () =>
    Effect.gen(function* () {
      const cloud = api();
      const fixture = stackFixture({
        token: Redacted.make(token),
        fetch: cloud.fetch,
      });
      const declare = (scope: "deployment:deploy" | "deployment:env:write") =>
        Convex.DeployKey("Key", {
          deploymentName: name,
          name: "writer",
          allowedActions: [scope],
        }).pipe(Effect.asVoid);
      yield* fixture.deploy(declare("deployment:deploy"));
      const refused = yield* failureOf(
        fixture.deploy(declare("deployment:env:write")),
      );
      expect(refused).toContain("DeployKeyChangeRequiresNewResource");
      expect(cloud.log).toEqual([`/v1/deployments/${name}/create_deploy_key`]);
    }),
);

it.effect(
  "does not mint another credential when its saved secret or remote key is lost",
  () =>
    Effect.gen(function* () {
      for (const lose of ["state", "remote"]) {
        const cloud = api();
        const fixture = stackFixture({
          fetch: cloud.fetch,
          token: Redacted.make(token),
        });
        const declared = Convex.DeployKey("Key", {
          deploymentName: name,
          name: "writer",
        }).pipe(Effect.asVoid);
        yield* fixture.deploy(declared);
        const row = fixture.rows.Fixture.test.Key;
        if (lose === "remote") cloud.forgetKey();
        else if (row.attr !== undefined) delete row.attr.deployKey;
        const result = yield* Effect.exit(fixture.deploy(declared));
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const text = Cause.pretty(result.cause);
          expect(text).toMatch(/(key not found|missing saved secret)/u);
          expect(text).not.toContain(token);
          expect(text).not.toContain(key);
        }
        expect(cloud.log).toHaveLength(1);
      }
    }),
);
