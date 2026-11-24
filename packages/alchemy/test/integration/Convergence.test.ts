import { Convex } from "@confect/alchemy";
import * as Api from "@confect/alchemy/ConvexClient";
import { it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { adopt } from "alchemy/AdoptPolicy";
import { stackFixture, failureOf } from "./StackFixture.js";

const deployment = {
  name: "convergence-12",
  url: "https://convergence-12.convex.cloud",
};
const opaque = Redacted.make("opaque-issued-key");

it.effect(
  "refreshes project output drift and an externally deleted project",
  () =>
    Effect.gen(function* () {
      let project: Api.Project | undefined;
      let created = 0,
        renames = 0;
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listProjects: () =>
            Effect.succeed(project === undefined ? [] : [project]),
          getProject: () =>
            project === undefined
              ? Effect.fail(
                  Api.ConvexNotFound.make({
                    operation: "getProject",
                    status: 404,
                    code: "HttpError",
                  }),
                )
              : Effect.succeed(project),
          createProject: (teamId, { projectName }) =>
            Effect.sync(() => {
              created++;
              project = {
                id: created,
                name: projectName,
                teamId,
                slug: "first",
                teamSlug: "team",
                createTime: 1,
              };
              return { id: created, projectId: created, slug: project.slug };
            }),
          updateProject: (id, { name }) =>
            Effect.sync(() => {
              renames++;
              project = {
                id,
                name: name ?? "invalid",
                teamId: 1,
                slug: "updated",
                teamSlug: "team",
                createTime: 1,
              };
              return project;
            }),
        }),
      });
      const declared = Convex.Project("P", { teamId: 1, name: "Managed" }).pipe(
        Effect.map((p) => p.slug),
      );
      yield* fixture.deploy(declared);
      const seed: Api.Project = {
        name: "Managed",
        slug: "externally-edited",
        teamId: 1,
        teamSlug: "team",
        createTime: 1,
        id: 1,
      };
      project = seed;
      const slug = yield* fixture.deploy(declared);
      expect(slug).toBe("externally-edited");
      project = { ...seed, name: "renamed" };
      yield* fixture.deploy(declared);
      expect(renames).toBe(1);
      project = undefined;
      yield* fixture.deploy(declared);
      expect(created).toBe(2);
    }),
);

it.effect(
  "checks the live deployment reference, location and immutable region during ordinary planning",
  () =>
    Effect.gen(function* () {
      const base = {
        kind: "cloud",
        name: deployment.name,
        deploymentUrl: deployment.url,
        reference: "notes",
        region: "aws-us-east-1",
        deploymentType: "prod",
        class: "s16",
        id: 21,
        projectId: 12,
        createTime: 1,
        isDefault: false,
      } as const;
      let live: Extract<Api.Deployment, { kind: "cloud" }> = { ...base };
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listDeployments: () => Effect.sync(() => [live]),
          getDeployment: () => Effect.sync(() => live),
          updateDeployment: (_name, { reference }) =>
            Effect.sync(() => {
              live = { ...live, reference: reference ?? "missing" };
            }),
        }),
      });
      const d = Convex.Deployment("D", {
        type: "prod",
        projectId: 12,
        reference: "notes",
      }).pipe(
        adopt(),
        Effect.map((r) => r.url),
      );
      yield* fixture.deploy(d);
      live = { ...live, reference: "changed" };
      let plan = yield* fixture.plan(d);
      expect(plan.resources.D.action).toBe("update");
      yield* fixture.deploy(d);
      expect(live.reference).toBe("notes");
      live = {
        ...live,
        deploymentUrl: `https://${deployment.name}.us-east-1.convex.cloud`,
      };
      plan = yield* fixture.plan(d);
      expect(plan.resources.D.action).toBe("update");
      const url = yield* fixture.deploy(d);
      expect(url).toBe(live.deploymentUrl);
      live = { ...live, region: "aws-ca-central-1" };
      const changedRegion = yield* failureOf(fixture.plan(d));
      expect(changedRegion).toContain("region");
    }),
);

it.effect(
  "adopts only an explicitly authorized compatible late discovery",
  () =>
    Effect.gen(function* () {
      const foreign = {
        id: 5,
        teamId: 9,
        teamSlug: "team",
        name: "Found",
        slug: "found",
        createTime: 1,
      };
      for (const allowed of [false, true]) {
        let reads = 0,
          creates = 0;
        const fixture = stackFixture({
          client: Layer.mock(Api.ConvexClient)({
            listProjects: () =>
              Effect.sync(() => (++reads === 1 ? [] : [foreign])),
            createProject: () =>
              Effect.sync(() => {
                creates++;
                return { id: 6, projectId: 6, slug: "new" };
              }),
          }),
        });
        const declared = Convex.Project("P", { teamId: 9, name: "Found" }).pipe(
          adopt(allowed),
          Effect.map((p) => p.projectId),
        );
        if (allowed) {
          const id = yield* fixture.deploy(declared);
          expect(id).toBe(5);
        } else {
          const diagnostic = yield* failureOf(fixture.deploy(declared));
          expect(diagnostic).toContain("adoption");
        }
        expect(creates).toBe(0);
      }
    }),
);

it.effect(
  "borrows with an opaque key and repairs managed drift before pushing code without writing unrelated names",
  () =>
    Effect.gen(function* () {
      let value = "initial",
        foreign = "not owned";
      const log: string[] = [];
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listEnvironmentVariables: () =>
            Effect.sync(() => ({
              MANAGED: Redacted.make(value),
              OTHER: Redacted.make(foreign),
            })),
          updateEnvironmentVariables: (_url, _key, changes) =>
            Effect.sync(() => {
              expect(changes).toHaveLength(1);
              expect(changes[0].name).toBe("MANAGED");
              const v = changes[0].value;
              value =
                v == null ? "" : typeof v === "string" ? v : Redacted.value(v);
              log.push("env");
            }),
        }),
        run: () =>
          Effect.sync(() => {
            log.push("code");
            return 0;
          }),
      });
      const declared = Effect.gen(function* () {
        const map = yield* Convex.EnvironmentVariables("Map", {
          url: deployment.url,
          deployKey: opaque,
          variables: { MANAGED: "desired" },
        }).pipe(adopt());
        yield* Convex.Code("Push", {
          deployment: { name: deployment.name, url: map.url },
          deployKey: Redacted.make("prod:convergence-12|cli"),
          cwd: import.meta.dirname,
        });
      });
      yield* fixture.deploy(declared);
      foreign = "other changed";
      yield* fixture.deploy(declared);
      value = "managed drift";
      yield* fixture.deploy(declared);
      expect(log).toEqual(["env", "code", "code", "env", "code"]);
      expect(foreign).toBe("other changed");
    }),
);

it.effect(
  "tracks a uniquified key by ID and revokes only a newly issued opaque key when its metadata cannot be verified",
  () =>
    Effect.gen(function* () {
      for (const ambiguous of [false, true]) {
        const metadata: Api.DeployKey[] = [
          { id: 11, name: "preexisting", allowedActions: [], creationTime: 1 },
        ];
        const revoked: Array<string | Redacted.Redacted<string>> = [];
        const fixture = stackFixture({
          client: Layer.mock(Api.ConvexClient)({
            listDeployKeys: () => Effect.sync(() => [...metadata]),
            createDeployKey: () =>
              Effect.sync(() => {
                metadata.push({
                  id: 12,
                  name: "writer (1)",
                  allowedActions: ["deployment:deploy"],
                  creationTime: 1,
                });
                if (ambiguous)
                  metadata.push({
                    id: 13,
                    name: "writer-2",
                    allowedActions: ["deployment:deploy"],
                    creationTime: 1,
                  });
                return { deployKey: opaque };
              }),
            deleteDeployKey: (_name, id) =>
              Effect.sync(() => {
                revoked.push(id);
              }),
          }),
        });
        const declared = Convex.DeployKey("K", {
          name: "writer",
          deploymentName: deployment.name,
          allowedActions: ["deployment:deploy"],
        }).pipe(Effect.map((k) => k.name));
        if (ambiguous) {
          const message = yield* failureOf(fixture.deploy(declared));
          expect(message).toContain("DeployKeyRecoveryRequired");
          expect(message).not.toContain(Redacted.value(opaque));
          expect(revoked).toEqual([opaque]);
        } else {
          const actual = yield* fixture.deploy(declared);
          expect(actual).toBe("writer (1)");
          yield* fixture.deploy(declared);
          metadata[1] = {
            ...metadata[1],
            allowedActions: ["deployment:env:view"],
          };
          const message = yield* failureOf(fixture.plan(declared));
          expect(message).toContain("allowedActions");
          expect(revoked).toEqual([]);
        }
      }
    }),
);
