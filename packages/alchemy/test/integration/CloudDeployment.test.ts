import * as Record from "effect/Record";
import * as Arr from "effect/Array";
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
import * as Drift from "alchemy/Drift";
import { AuthProviders } from "alchemy/Auth/AuthProvider";
import { CredentialsStoreLive } from "alchemy/Auth/Credentials";
import { ProfileStoreLive } from "alchemy/Auth/Profile";
import { provideFreshArtifactStore } from "alchemy/Artifacts";
import { layerNonInteractive } from "alchemy/Interaction";
import * as Plan from "alchemy/Plan";
import { renamedFrom } from "alchemy/Rename";
import * as Provider from "alchemy/Provider";
import * as Stack from "alchemy/Stack";
import { Stage } from "alchemy/Stage";
import { inMemoryState } from "alchemy/State/InMemoryState";
import * as Effect from "effect/Effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
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
      Digest.layerWebCrypto,
      SecureRandom.layerWebCrypto,
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
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- Each deployment is an isolated test entry point; close its state scope before the next apply.
      Effect.provide(state),
      provideFreshArtifactStore,
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- Keep runtime services local to this deployment, outside its fresh artifact store.
      Effect.provide(context),
      Effect.scoped,
    );
  return deploy;
};

describe("cloud deployment lifecycle", () => {
  it.effect("does not report deployed code as verified by a drift check", () =>
    Effect.gen(function* () {
      const stack = { name: "integration", stage: "test" };
      const services = yield* Layer.build(
        Layer.mergeAll(
          Code.layer.pipe(
            Layer.provide(
              Layer.succeed(CommandRunner, {
                prepare: () => Effect.void,
                deploy: () => Effect.void,
              }),
            ),
          ),
          inMemoryState({
            integration: {
              test: {
                Code: {
                  status: "created",
                  resourceType: Convex.Code.Type,
                  fqn: "Code",
                  logicalId: "Code",
                  instanceId: "instance",
                  namespace: undefined,
                  downstream: [],
                  bindings: [],
                  providerVersion: 0,
                  props: {},
                  attr: {
                    name: "example",
                    url: "https://example.convex.cloud",
                  },
                },
              },
            },
          }),
        ),
      );
      const result = yield* Effect.succeed(stack).pipe(
        Effect.flatMap(Drift.detect),
        Effect.orDie,
        Effect.provideContext(services),
      );
      expect(result.resources.Code.action).toBe("skipped");
    }),
  );
  it.effect(
    "does not adopt a renamed project's physical identity at its former logical ID",
    () =>
      Effect.gen(function* () {
        const fixture = mockClient();
        const deploy = makeHarness(
          fixture.layer,
          Layer.succeed(CommandRunner, {
            prepare: () => Effect.void,
            deploy: () => Effect.void,
          }),
          true,
        );
        const project = (id: string) =>
          Convex.Project(id, { teamId: 10, name: "example" });
        yield* deploy(project("Old").pipe(Effect.as({})));
        const moved = project("New").pipe(renamedFrom("Old"));
        const result = yield* deploy(
          Effect.gen(function* () {
            yield* moved;
            yield* project("Old").pipe(RemovalPolicy.destroy());
            return {};
          }),
        ).pipe(Effect.result);
        yield* deploy(moved.pipe(Effect.as({})));
        expect(fixture.client.deleteProject).not.toHaveBeenCalled();
        expect(fixture.state.projects).toHaveLength(1);
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "OwnedBySomeoneElse" },
        });
      }),
  );

  it.effect.each([false, true])(
    "cleans an interrupted create with retry=%s",
    (retry) =>
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
                  ConvexApiError.make({
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
                  ConvexApiError.make({
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
        const deploymentResult = yield* deploy(resources).pipe(Effect.result);
        expect(Result.isFailure(deploymentResult)).toBe(true);
        expect(fixture.state.projects).toHaveLength(1);
        expect(fixture.state.keys).toHaveLength(0);
        expect(pushes).toBe(0);
        if (retry) {
          const deploymentResult2 = yield* deploy(resources);
          expect(deploymentResult2).toEqual({
            url: "https://happy-otter-123.convex.cloud",
          });
          expect(pushes).toBe(1);
        }
        yield* deploy(Effect.succeed({}));
        expect(Arr.every(names, (name) => name === "happy-otter-123")).toBe(
          true,
        );
        expect(fixture.state.projects).toHaveLength(0);
        expect(fixture.state.deployments).toHaveLength(0);
        expect(fixture.state.keys).toHaveLength(0);
        expect(fixture.state.variables).toEqual({});
      }),
  );

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
                    ConvexApiError.make({
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
        const deploymentResult3 = yield* deploy(resources).pipe(Effect.result);
        expect(Result.isFailure(deploymentResult3)).toBe(true);
        const retried = yield* deploy(resources).pipe(Effect.result);
        expect(retried).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "DeployKeyRecoveryRequired" },
        });
        expect(fixture.client.createDeployKey).toHaveBeenCalledTimes(1);
        expect(fixture.state.keys).toHaveLength(1);
      }),
  );

  it.effect.each([
    { global: false, resource: undefined, succeeds: false },
    { global: true, resource: undefined, succeeds: true },
    { global: true, resource: false, succeeds: false },
    { global: false, resource: true, succeeds: true },
  ])("honors adoption with global=$global, resource=$resource", (scenario) =>
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
        const deploymentResult4 = yield* deploy(resources);
        expect(deploymentResult4).toEqual({
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
                      ConvexApiError.make({
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
        const deploymentResult5 = yield* deploy(resources).pipe(Effect.result);
        expect(Result.isFailure(deploymentResult5)).toBe(true);
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
    "never deletes an incompatible deployment after deferred adoption fails",
    () =>
      Effect.gen(function* () {
        const fixture = mockClient();
        fixture.state.deployments = [existingDeployment()];
        const deploy = makeHarness(
          fixture.layer,
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
          yield* Convex.Deployment("Deployment", {
            projectId: project.projectId,
            reference: "example",
            type: "dev",
          }).pipe(adopt(true), RemovalPolicy.destroy());
          return {};
        });
        const result = yield* deploy(resources).pipe(Effect.result);
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "DeploymentIdentityChange" },
        });
        yield* deploy(Effect.succeed({}));
        expect(fixture.client.deleteDeployment).not.toHaveBeenCalled();
        expect(fixture.state.deployments).toHaveLength(1);
      }),
  );

  it.effect.each([
    { updating: false, retry: false },
    { updating: false, retry: true },
    { updating: true, retry: false },
    { updating: true, retry: true },
  ])(
    "recovers newly managed variables after a lost response (updating=$updating, retry=$retry)",
    ({ updating, retry }) =>
      Effect.gen(function* () {
        const fixture = mockClient();
        fixture.state.variables.UNRELATED = Redacted.make("preserved");
        let loseResponse = false;
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
                      ConvexApiError.make({
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
        );
        const resource = (variables: Record<string, string>) =>
          Convex.EnvironmentVariables("Environment", {
            url: "https://happy-otter-123.convex.cloud",
            deployKey: Redacted.make("test-key"),
            variables,
          }).pipe(Effect.as({}));
        if (updating) yield* deploy(resource({ OLD: "old" }));
        const desired = resource({ NEW: "new" });
        loseResponse = true;
        const failure = yield* deploy(desired).pipe(Effect.result);
        expect(failure).toMatchObject({ _tag: "Failure" });
        expect(Redacted.value(fixture.state.variables.NEW)).toBe("new");
        if (retry) yield* deploy(desired);
        yield* deploy(Effect.succeed({}));
        expect(Record.keys(fixture.state.variables)).toEqual(["UNRELATED"]);
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
            allowedActions: [
              "deployment:deploy",
              "deployment:env:view",
              "deployment:env:write",
            ],
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
        expect(Record.keys(fixture.state.variables)).toEqual(["UNRELATED"]);
        expect(Redacted.value(fixture.state.variables.UNRELATED)).toBe(
          "preserve-me",
        );
        expect(operations).toHaveLength(6);
      }),
  );

  it.effect(
    "rejects a mismatched backend target before writing its environment",
    () =>
      Effect.gen(function* () {
        const fixture = mockClient();
        const deploy = makeHarness(
          fixture.layer,
          Layer.succeed(CommandRunner, {
            prepare: () => Effect.void,
            deploy: () => Effect.void,
          }),
        );
        const resources = Confect.Backend("Backend", {
          deployment: {
            name: "other-target-123",
            url: "https://happy-otter-123.convex.cloud",
          },
          deployKey: Redacted.make("prod:happy-otter-123|integration-test"),
          env: { NEW: "new" },
        }).pipe(Effect.as({}));
        const result = yield* deploy(resources).pipe(Effect.result);
        expect(result).toMatchObject({ _tag: "Failure" });
        expect(
          fixture.client.updateEnvironmentVariables,
        ).not.toHaveBeenCalled();
      }),
  );
});
