import { Convex } from "@confect/alchemy";
import * as Api from "@confect/alchemy/ConvexClient";
import { expect, it } from "@effect/vitest";
import { adopt } from "alchemy/AdoptPolicy";
import * as Rename from "alchemy/Rename";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Record from "effect/Record";
import { failureOf, stackFixture } from "./StackFixture.js";

const key = Redacted.make("prod:lemon-12|deploy");
const url = "https://lemon-12.convex.cloud";
const deployment = { name: "lemon-12", url };

it.effect(
  "never reissues or revokes a one-time credential after losing the create response",
  () =>
    Effect.gen(function* () {
      const keys: Api.DeployKey[] = [];
      let creates = 0,
        revokes = 0;
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listDeployKeys: () => Effect.succeed(keys),
          createDeployKey: (_deployment, input) =>
            Effect.gen(function* () {
              creates++;
              keys.push({
                id: 7,
                name: input.name,
                creationTime: 1,
                allowedActions: ["deployment:deploy"],
              });
              return yield* Api.ConvexApiError.make({
                operation: "createDeployKey",
                code: "TransportError",
              });
            }),
          deleteDeployKey: () =>
            Effect.sync(() => {
              revokes++;
            }),
        }),
      });
      const declared = Convex.DeployKey("Key", {
        deploymentName: deployment.name,
      }).pipe(Effect.asVoid);
      const lost = yield* failureOf(fixture.deploy(declared));
      expect(lost).toContain("TransportError");
      const retry = yield* failureOf(fixture.deploy(declared));
      expect(retry).toContain("DeployKeyRecoveryRequired");
      const destroy = yield* Effect.exit(fixture.deploy(Effect.void));
      expect(destroy._tag).toBe("Failure");
      expect([creates, revokes]).toEqual([1, 0]);
    }),
);

it.effect(
  "restores originals after a successful write whose response was lost",
  () =>
    Effect.gen(function* () {
      const live: globalThis.Record<string, Redacted.Redacted<string>> = {
        TOKEN: Redacted.make("before"),
      };
      let lose = true;
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listEnvironmentVariables: () => Effect.succeed(live),
          updateEnvironmentVariables: (_url, _key, changes) =>
            Effect.gen(function* () {
              for (const change of changes) {
                if (change.value == null) delete live[change.name];
                else
                  live[change.name] =
                    typeof change.value === "string"
                      ? Redacted.make(change.value)
                      : change.value;
              }
              if (lose) {
                lose = false;
                return yield* Api.ConvexApiError.make({
                  operation: "updateEnvironmentVariables",
                  code: "TransportError",
                });
              }
            }),
        }),
      });
      const declared = Convex.EnvironmentVariables("Borrow", {
        url,
        deployKey: key,
        variables: { TOKEN: "after" },
      }).pipe(adopt(), Effect.asVoid);
      const lost = yield* failureOf(fixture.deploy(declared));
      expect(lost).toContain("TransportError");
      expect(Redacted.value(live.TOKEN)).toBe("after");
      yield* fixture.deploy(Effect.void);
      expect(Redacted.value(live.TOKEN)).toBe("before");
    }),
);

it.effect(
  "never deletes or adopts an unknown project after an interrupted create",
  () =>
    Effect.gen(function* () {
      let deletes = 0;
      const projects: Api.Project[] = [];
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listProjects: () => Effect.succeed(projects),
          createProject: (teamId, p) =>
            Effect.gen(function* () {
              projects.push({
                teamId,
                id: 9,
                name: p.projectName,
                slug: "project",
                teamSlug: "team",
                createTime: 1,
              });
              return yield* Api.ConvexApiError.make({
                operation: "createProject",
                code: "TransportError",
              });
            }),
          deleteProject: () =>
            Effect.sync(() => {
              deletes++;
            }),
        }),
      });
      const declare = Convex.Project("Project", {
        teamId: 3,
        name: "Retained",
      }).pipe(RemovalPolicy.destroy(), Effect.asVoid);
      const lost = yield* failureOf(fixture.deploy(declare));
      expect(lost).toContain("TransportError");
      const retry = yield* failureOf(fixture.deploy(declare));
      expect(retry).toContain("adopt");
      yield* fixture.deploy(Effect.void);
      expect(deletes).toBe(0);
    }),
);

it.effect(
  "keeps generated names distinct when a logical ID is reused after renaming",
  () =>
    Effect.gen(function* () {
      const projects: Api.Project[] = [];
      const fixture = stackFixture({
        client: Layer.mock(Api.ConvexClient)({
          listProjects: () => Effect.succeed(projects),
          getProject: (id) => Effect.succeed(projects[id - 1]),
          createProject: (teamId, p) =>
            Effect.sync(() => {
              const id = projects.length + 1;
              projects.push({
                id,
                teamId,
                name: p.projectName,
                slug: p.projectName,
                teamSlug: "t",
                createTime: 1,
              });
              return { id, projectId: id, slug: p.projectName };
            }),
        }),
      });
      const p = (logicalId: string) => Convex.Project(logicalId, { teamId: 7 });
      yield* fixture.deploy(p("Old").pipe(Effect.asVoid));
      const original = projects[0].name;
      yield* fixture.deploy(
        Effect.gen(function* () {
          yield* p("New").pipe(Rename.renamedFrom("Old"));
          yield* p("Old");
        }),
      );
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe(original);
      expect(projects[1].name).not.toBe(original);
    }),
);

it.effect(
  "rejects opaque or conflicting variable names before evaluating any output values",
  () =>
    Effect.gen(function* () {
      let evaluated = 0;
      const value = Output.fromEffect(
        Effect.sync(() => {
          evaluated++;
          return "secret";
        }),
      );
      const fixture = stackFixture();
      const conflict = Convex.EnvironmentVariables("Map", {
        url,
        deployKey: key,
        variables: { Type: value, FQN: value },
      });
      const message = yield* failureOf(fixture.plan(conflict));
      expect(message).toContain("ConflictingEnvironmentNames");
      const unknown = Convex.EnvironmentVariables("Map", {
        url,
        deployKey: key,
        variables: Output.fromEffect(
          Effect.sync(() => {
            evaluated++;
            return { A: "private" };
          }),
        ).as<Convex.EnvironmentVariablesProps["variables"]>(),
      });
      const other = yield* failureOf(fixture.plan(unknown));
      expect(other).toContain("UnresolvedEnvironmentVariableNames");
      expect(evaluated).toBe(0);
    }),
);

it.effect("identity changes cannot replace or delete a managed value", () =>
  Effect.gen(function* () {
    let writes = 0;
    const client = Layer.mock(Api.ConvexClient)({
      listEnvironmentVariables: () =>
        Effect.succeed(Record.fromEntries([["A", Redacted.make("x")]])),
      updateEnvironmentVariables: () =>
        Effect.sync(() => {
          writes++;
        }),
    });
    const fixture = stackFixture({ client });
    const writer = (name: string) =>
      Convex.AuthoritativeEnvironmentVariable("W", {
        deployment,
        deployKey: key,
        name,
        value: "initial",
      }).pipe(RemovalPolicy.destroy());
    yield* fixture.deploy(writer("A").pipe(Effect.asVoid));
    const refused = yield* failureOf(
      fixture.deploy(writer("B").pipe(Effect.asVoid)),
    );
    expect(refused).toContain("AuthoritativeEnvironmentVariableIdentityChange");
    expect(writes).toBe(1);
    const borrowed = (origin: string) =>
      Convex.EnvironmentVariables("E", {
        url: origin,
        deployKey: key,
        variables: { A: "new" },
      }).pipe(adopt());
    yield* fixture.deploy(borrowed(url).pipe(Effect.asVoid));
    const before = writes;
    const moved = yield* failureOf(
      fixture.plan(borrowed("https://lemon-12.eu-west-1.convex.cloud")),
    );
    expect(moved).toContain("EnvironmentTargetChange");
    expect(writes).toBe(before);
  }),
);
