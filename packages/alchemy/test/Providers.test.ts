import { Confect, Convex } from "@confect/alchemy";
import * as Backend from "@confect/alchemy/Backend";
import * as Project from "@confect/alchemy/Project";
import * as Deployment from "@confect/alchemy/Deployment";
import * as DeployKey from "@confect/alchemy/DeployKey";
import * as Code from "@confect/alchemy/Code";
import * as EnvironmentVariables from "@confect/alchemy/EnvironmentVariables";
import * as Writer from "@confect/alchemy/AuthoritativeEnvironmentVariable";
import * as Providers from "@confect/alchemy/Providers";
import * as Client from "@confect/alchemy/ConvexClient";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { noopSession } from "alchemy/Report";
import { Stack } from "alchemy/Stack";
import { inMemoryState, type ResourceState } from "alchemy/State";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

it.effect(
  "exports native resources and their provider hooks without building a stack",
  () =>
    Effect.gen(function* () {
      for (const [direct, ns] of [
        [Project.Project, Convex.Project],
        [Deployment.Deployment, Convex.Deployment],
        [DeployKey.DeployKey, Convex.DeployKey],
        [Code.Code, Convex.Code],
        [
          EnvironmentVariables.EnvironmentVariables,
          Convex.EnvironmentVariables,
        ],
        [
          Writer.AuthoritativeEnvironmentVariable,
          Convex.AuthoritativeEnvironmentVariable,
        ],
      ]) {
        expect(direct).toBe(ns);
      }
      expect(Backend.Backend).toBe(Confect.Backend);
      expect(Backend.ConflictingEnvironmentNames).toBe(
        EnvironmentVariables.ConflictingEnvironmentNames,
      );
      expect(Providers.Providers.key).toBe("@confect/alchemy/Providers");
      for (const module of [
        Project,
        Deployment,
        DeployKey,
        Code,
        EnvironmentVariables,
        Writer,
      ]) {
        expect(Effect.isEffect(module.provider)).toBe(true);
        expect(Layer.isLayer(module.layer)).toBe(true);
      }
      const calls: string[] = [];
      const client = Layer.mock(Client.ConvexClient)({
        listProjects: (teamId) =>
          Effect.sync(() => {
            calls.push("projects");
            return Array.map([1, 2], (id) => ({
              id,
              teamId,
              name: "Notes",
              slug: "notes",
              teamSlug: "team",
              createTime: 1,
            }));
          }),
        updateEnvironmentVariables: (url, _key, changes) =>
          Effect.sync(() => {
            calls.push(url);
            expect(changes).toEqual([{ name: "A", value: "red" }]);
          }),
      });
      const ctx = yield* Layer.build(client);
      const available = yield* Layer.build(
        Providers.providers().pipe(
          Layer.provide(client),
          Layer.provide(NodeServices.layer),
        ),
      );
      const collection = yield* Effect.provide(Providers.Providers, available);
      expect(collection.get("Convex.Project")).toHaveProperty("read");
      const projects = yield* Effect.provide(Project.provider, ctx);
      const input = { id: "id", fqn: "id", instanceId: "01" };
      const ambiguous = yield* projects
        .read({
          ...input,
          olds: { name: "Notes", teamId: 7 },
          output: undefined,
        })
        .pipe(Effect.flip);
      expect(ambiguous).toBeInstanceOf(Project.AmbiguousProject);
      expect(ambiguous).toMatchObject({
        projectName: "Notes",
        projectIds: [1, 2],
        teamId: 7,
      });
      const writer = yield* Effect.provide(Writer.provider, ctx);
      const url = "https://flower-13.convex.cloud";
      const news = {
        deployment: { name: "flower-13", url },
        deployKey: Redacted.make("dev:flower-13|mock"),
        name: "A",
        value: "red",
      };
      const row: ResourceState = {
        status: "creating",
        resourceType: Writer.AuthoritativeEnvironmentVariable.Type,
        instanceId: input.instanceId,
        fqn: input.fqn,
        logicalId: input.id,
        namespace: undefined,
        downstream: [],
        bindings: [],
        providerVersion: 0,
        props: news,
      };
      const rows = { fixture: { test: { id: row } } };
      const lifecycle = yield* Layer.build(
        Layer.mergeAll(
          inMemoryState(rows),
          Layer.succeed(Stack, {
            name: "fixture",
            stage: "test",
            resources: {},
            actions: {},
            bindings: {},
          }),
        ),
      );
      const write = writer.reconcile({
        ...input,
        session: noopSession,
        bindings: [],
        news,
        olds: undefined,
        output: undefined,
      });
      const actual = yield* Effect.provide(write, lifecycle);
      expect(actual).toEqual({ name: "A", url });
      rows.fixture.test.id = { ...row, instanceId: "replacement" };
      const stale = yield* write.pipe(Effect.provide(lifecycle), Effect.flip);
      expect(stale._tag).toBe("RecoveryUnavailable");
      expect(calls).toEqual(["projects", url]);
      const register = yield* Layer.build(
        Writer.layer.pipe(Layer.provide(client)),
      );
      const registered = yield* Effect.provide(
        Writer.AuthoritativeEnvironmentVariable.Provider,
        register,
      );
      expect(registered).toHaveProperty("reconcile");
    }),
);
