import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { Confect, Convex } from "@confect/alchemy";
import * as Code from "@confect/alchemy/Code";
import * as Deployment from "@confect/alchemy/Deployment";
import * as DeployKey from "@confect/alchemy/DeployKey";
import * as EnvironmentVariables from "@confect/alchemy/EnvironmentVariables";
import * as Project from "@confect/alchemy/Project";
import { ConvexClient, ConvexApiError } from "@confect/alchemy/ConvexClient";
import { adopt } from "alchemy/AdoptPolicy";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Result from "effect/Result";
import { Providers } from "@confect/alchemy/Providers";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { apply } from "alchemy/Apply";
import { AuthProviders } from "alchemy/Auth/AuthProvider";
import { CredentialsStoreLive } from "alchemy/Auth/Credentials";
import { ProfileStoreLive } from "alchemy/Auth/Profile";
import { provideFreshArtifactStore } from "alchemy/Artifacts";
import { layerNonInteractive } from "alchemy/Interaction";
import * as Plan from "alchemy/Plan";
import * as Provider from "alchemy/Provider";
import * as Stack from "alchemy/Stack";
import { Stage } from "alchemy/Stage";
import { inMemoryState } from "alchemy/State/InMemoryState";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { describe, expect } from "@effect/vitest";
import { CommandRunner } from "../../src/internal/CommandRunner";
import {
  mockClient,
  project as existingProject,
  deployment as existingDeployment,
} from "../fixtures/ConvexClient";

const makeHarness = (
  client: Layer.Layer<ConvexClient>,
  runner: Layer.Layer<CommandRunner>,
  allowAdoption = false,
) => {
  const context = Layer.mergeAll(
    Layer.mergeAll(
      CredentialsStoreLive,
      ProfileStoreLive,
      layerNonInteractive(),
      FetchHttpClient.layer,
    ).pipe(Layer.provideMerge(NodeServices.layer)),
    Layer.succeed(Stage, "test"),
    Layer.succeed(AuthProviders, {}),
    Layer.succeed(AlchemyContext, {
      dotAlchemy: ".alchemy",
      dev: false,
      adopt: allowAdoption,
    }),
  );
  const providers = Layer.effect(
    Providers,
    Provider.collection([
      Project.Project,
      Deployment.Deployment,
      DeployKey.DeployKey,
      EnvironmentVariables.EnvironmentVariables,
      Code.Code,
    ]),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        Project.layer,
        Deployment.layer,
        DeployKey.layer,
        EnvironmentVariables.layer,
        Code.layer,
      ),
    ),
    Layer.provide(client),
    Layer.provide(runner),
  );
  const state = inMemoryState();
  const deploy = <A, E, R extends Providers | Stack.StackServices>(
    program: Effect.Effect<A, E, R>,
  ) =>
    program.pipe(
      Stack.make({ name: "integration", providers, state }),
      Effect.flatMap((compiled) =>
        Plan.make(compiled).pipe(
          Effect.flatMap(apply),
          Effect.provideContext(compiled.services),
        ),
      ),
      Effect.provide(state),
      provideFreshArtifactStore,
      Effect.provide(context),
      Effect.scoped,
    );
  return deploy;
};

describe("cloud deployment lifecycle", () => {
  for (const retry of [false, true]) {
    it.effect(
      `cleans an interrupted create${retry ? " after retrying" : " without retrying"}`,
      () =>
        Effect.gen(function* () {
          const fixture = mockClient({
            deployKey: "prod:happy-otter-123|integration-test",
          });
          let reject = true;
          const names: string[] = [];
          const client = Layer.succeed(ConvexClient, {
            ...fixture.client,
            createDeployKey: (name, input) =>
              Effect.suspend(() => {
                if (reject) {
                  reject = false;
                  return Effect.fail(
                    new ConvexApiError({
                      operation: "createDeployKey",
                      status: 503,
                      code: "HttpError",
                    }),
                  );
                }
                return fixture.client.createDeployKey(name, input);
              }),
            listDeployKeys: (name) => {
              names.push(name);
              return name === undefined
                ? Effect.fail(
                    new ConvexApiError({
                      operation: "listDeployKeys",
                      status: 400,
                      code: "HttpError",
                    }),
                  )
                : fixture.client.listDeployKeys();
            },
          });
          let pushes = 0;
          const deploy = makeHarness(
            client,
            Layer.succeed(CommandRunner, {
              prepare: () => Effect.void,
              deploy: () =>
                Effect.sync(() => {
                  pushes++;
                }),
            }),
          );
          const resources = Effect.gen(function* () {
            const project = yield* Convex.Project("Project", {
              teamId: 10,
              name: "example",
            }).pipe(RemovalPolicy.destroy());
            const deployment = yield* Convex.Deployment("Deployment", {
              projectId: project.projectId,
              type: "prod",
              reference: "example",
            }).pipe(RemovalPolicy.destroy());
            const key = yield* Convex.DeployKey("Key", {
              deploymentName: deployment.name,
              name: "example",
            });
            const backend = yield* Confect.Backend("Backend", {
              deployment,
              deployKey: key.deployKey,
              env: { ORIGIN: "https://example.com" },
            });
            return { url: backend.url };
          });
          expect(
            Result.isFailure(yield* deploy(resources).pipe(Effect.result)),
          ).toBe(true);
          expect(fixture.state.projects).toHaveLength(1);
          expect(fixture.state.keys).toHaveLength(0);
          expect(pushes).toBe(0);
          if (retry) {
            expect(yield* deploy(resources)).toEqual({
              url: "https://happy-otter-123.convex.cloud",
            });
            expect(pushes).toBe(1);
          }
          yield* deploy(Effect.succeed({}));
          expect(names.every((name) => name === "happy-otter-123")).toBe(true);
          expect(fixture.state.projects).toHaveLength(0);
          expect(fixture.state.deployments).toHaveLength(0);
          expect(fixture.state.keys).toHaveLength(0);
          expect(fixture.state.variables).toEqual({});
        }),
    );
  }

  it.effect(
    "does not reissue a key when creation succeeded but its secret was lost",
    () =>
      Effect.gen(function* () {
        const fixture = mockClient();
        const deploy = makeHarness(
          Layer.succeed(ConvexClient, {
            ...fixture.client,
            createDeployKey: (name, input) =>
              fixture.client.createDeployKey(name, input).pipe(
                Effect.andThen(
                  Effect.fail(
                    new ConvexApiError({
                      operation: "createDeployKey",
                      code: "TransportError",
                    }),
                  ),
                ),
              ),
          }),
          Layer.succeed(CommandRunner, {
            prepare: () => Effect.void,
            deploy: () => Effect.void,
          }),
        );
        const resources = Effect.gen(function* () {
          const project = yield* Convex.Project("Project", {
            teamId: 10,
            name: "example",
          });
          const deployment = yield* Convex.Deployment("Deployment", {
            projectId: project.projectId,
            type: "prod",
            reference: "example",
          });
          const key = yield* Convex.DeployKey("Key", {
            deploymentName: deployment.name,
            name: "example",
          });
          return { keyId: key.keyId };
        });
        expect(
          Result.isFailure(yield* deploy(resources).pipe(Effect.result)),
        ).toBe(true);
        const retried = yield* deploy(resources).pipe(Effect.result);
        expect(retried).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "DeployKeyRecoveryRequired" },
        });
        expect(fixture.client.createDeployKey).toHaveBeenCalledTimes(1);
        expect(fixture.state.keys).toHaveLength(1);
      }),
  );

  for (const scenario of [
    { global: false, resource: undefined, succeeds: false },
    { global: true, resource: undefined, succeeds: true },
    { global: true, resource: false, succeeds: false },
    { global: false, resource: true, succeeds: true },
  ]) {
    it.effect(
      `honors adoption with global=${scenario.global}, resource=${scenario.resource}`,
      () =>
        Effect.gen(function* () {
          const fixture = mockClient();
          fixture.state.projects = [existingProject()];
          fixture.state.deployments = [existingDeployment()];
          const deploy = makeHarness(
            fixture.layer,
            Layer.succeed(CommandRunner, {
              prepare: () => Effect.void,
              deploy: () => Effect.void,
            }),
            scenario.global,
          );
          const resources = Effect.gen(function* () {
            const project = yield* Convex.Project("Project", {
              teamId: 10,
              name: "example",
            }).pipe(adopt(true));
            const declaration = Convex.Deployment("Deployment", {
              projectId: project.projectId,
              type: "prod",
              reference: "example",
            });
            const deployment = yield* scenario.resource === undefined
              ? declaration
              : declaration.pipe(adopt(scenario.resource));
            return { name: deployment.name };
          });
          const result = yield* deploy(resources).pipe(Effect.result);
          if (scenario.succeeds) {
            expect(result).toEqual(Result.succeed({ name: "happy-otter-123" }));
            expect(yield* deploy(resources)).toEqual({
              name: "happy-otter-123",
            });
          } else {
            expect(result).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "OwnedBySomeoneElse" },
            });
          }
          expect(fixture.client.createProject).not.toHaveBeenCalled();
          expect(fixture.client.createDeployment).not.toHaveBeenCalled();
        }),
    );
  }

  it.effect(
    "preserves late-adopted environment originals across a lost update response",
    () =>
      Effect.gen(function* () {
        const fixture = mockClient({
          deployKey: "prod:happy-otter-123|integration-test",
        });
        fixture.state.variables = {
          ORIGIN: Redacted.make("original"),
          UNRELATED: Redacted.make("preserve-me"),
        };
        let loseResponse = true;
        const deploy = makeHarness(
          Layer.succeed(ConvexClient, {
            ...fixture.client,
            updateEnvironmentVariables: (url, key, changes) =>
              fixture.client.updateEnvironmentVariables(url, key, changes).pipe(
                Effect.andThen(
                  Effect.suspend(() => {
                    if (!loseResponse) return Effect.void;
                    loseResponse = false;
                    return Effect.fail(
                      new ConvexApiError({
                        operation: "updateEnvironmentVariables",
                        code: "TransportError",
                      }),
                    );
                  }),
                ),
              ),
          }),
          Layer.succeed(CommandRunner, {
            prepare: () => Effect.void,
            deploy: () => Effect.void,
          }),
          true,
        );
        const resources = Effect.gen(function* () {
          const project = yield* Convex.Project("Project", {
            teamId: 10,
            name: "example",
          });
          const deployment = yield* Convex.Deployment("Deployment", {
            projectId: project.projectId,
            type: "prod",
            reference: "example",
          });
          const key = yield* Convex.DeployKey("Key", {
            deploymentName: deployment.name,
            name: "example",
          });
          const backend = yield* Confect.Backend("Backend", {
            deployment,
            deployKey: key.deployKey,
            env: { ORIGIN: "replacement" },
          });
          return { url: backend.url };
        });
        expect(
          Result.isFailure(yield* deploy(resources).pipe(Effect.result)),
        ).toBe(true);
        yield* deploy(resources);
        expect(Redacted.value(fixture.state.variables.ORIGIN)).toBe(
          "replacement",
        );
        yield* deploy(Effect.succeed({}));
        expect(Redacted.value(fixture.state.variables.ORIGIN)).toBe("original");
        expect(Redacted.value(fixture.state.variables.UNRELATED)).toBe(
          "preserve-me",
        );
        expect(fixture.state.keys).toHaveLength(0);
      }),
  );

  it.effect(
    "orders environment, codegen, and push, then retains data on removal",
    () =>
      Effect.gen(function* () {
        const fixture = mockClient({
          deployKey: "prod:happy-otter-123|integration-test",
        });
        const operations: string[] = [];
        const runner = Layer.succeed(CommandRunner, {
          prepare: () =>
            Effect.sync(() => {
              expect(Redacted.value(fixture.state.variables.ORIGIN)).toBe(
                "https://example.com",
              );
              operations.push("codegen");
            }),
          deploy: () =>
            Effect.sync(() => {
              expect(operations.at(-1)).toBe("codegen");
              operations.push("deploy");
            }),
        });
        const deploy = makeHarness(fixture.layer, runner);
        const resources = Effect.gen(function* () {
          const project = yield* Convex.Project("Project", {
            teamId: 10,
            name: "example",
          });
          const deployment = yield* Convex.Deployment("Deployment", {
            projectId: project.projectId,
            type: "prod",
            reference: "example",
          });
          const key = yield* Convex.DeployKey("Key", {
            deploymentName: deployment.name,
            name: "example",
          });
          const backend = yield* Confect.Backend("Backend", {
            deployment,
            deployKey: key.deployKey,
            env: { ORIGIN: "https://example.com" },
          });
          return { url: backend.url };
        });
        const first = yield* deploy(resources);
        expect(first).toEqual({ url: "https://happy-otter-123.convex.cloud" });
        yield* deploy(resources);
        expect(operations).toEqual(["codegen", "deploy", "codegen", "deploy"]);
        expect(fixture.client.createProject).toHaveBeenCalledTimes(1);
        expect(fixture.client.createDeployment).toHaveBeenCalledTimes(1);
        expect(fixture.client.createDeployKey).toHaveBeenCalledTimes(1);
        expect(fixture.client.updateEnvironmentVariables).toHaveBeenCalledTimes(
          1,
        );
        fixture.state.projects[0].name = "changed-outside-alchemy";
        fixture.state.variables.ORIGIN = Redacted.make("https://wrong.example");
        fixture.state.variables.UNRELATED = Redacted.make("preserve-me");
        yield* deploy(resources);
        expect(fixture.state.projects[0].name).toBe("example");
        expect(fixture.client.updateEnvironmentVariables).toHaveBeenCalledTimes(
          2,
        );
        yield* deploy(Effect.succeed({}));
        expect(fixture.state.projects).toHaveLength(1);
        expect(fixture.state.deployments).toHaveLength(1);
        expect(fixture.state.keys).toHaveLength(0);
        expect(Object.keys(fixture.state.variables)).toEqual(["UNRELATED"]);
        expect(Redacted.value(fixture.state.variables.UNRELATED)).toBe(
          "preserve-me",
        );
        expect(operations).toHaveLength(6);
      }),
  );
});
