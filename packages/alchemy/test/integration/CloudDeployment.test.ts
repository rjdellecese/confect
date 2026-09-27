import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { Confect, Convex } from "@confect/alchemy";
import * as Code from "@confect/alchemy/Code";
import * as Deployment from "@confect/alchemy/Deployment";
import * as DeployKey from "@confect/alchemy/DeployKey";
import * as EnvironmentVariables from "@confect/alchemy/EnvironmentVariables";
import * as Project from "@confect/alchemy/Project";
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
import { mockClient } from "../fixtures/ConvexClient";

describe("cloud deployment lifecycle", () => {
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
          Layer.provide(fixture.layer),
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
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
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
              adopt: false,
            }),
          ),
        ),
        Effect.scoped,
      ),
  );
});
