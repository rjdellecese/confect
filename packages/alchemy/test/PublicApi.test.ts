import { Confect, Convex } from "@confect/alchemy";
import { describe, expect, it } from "@effect/vitest";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

describe("public API", () => {
  it("accepts the documented managed-backend stack without executing it", () => {
    const stack = Alchemy.Stack(
      "Notes",
      { providers: Convex.providers(), state: Alchemy.localState() },
      Effect.gen(function* () {
        const project = yield* Convex.Project("Project", {
          teamId: yield* Config.Number("CONVEX_TEAM_ID"),
          name: "notes-production",
        });
        const deployment = yield* Convex.Deployment("Deployment", {
          projectId: project.projectId,
          type: "prod",
          reference: "notes-production",
        });
        const key = yield* Convex.DeployKey("DeployKey", {
          deploymentName: deployment.name,
          allowedActions: [
            "deployment:deploy",
            "deployment:env:view",
            "deployment:env:write",
          ],
        });
        const backend = yield* Confect.Backend("Backend", {
          deployment,
          deployKey: key.deployKey,
          cwd: "apps/backend",
          env: { SERVICE_TOKEN: yield* Config.Redacted("SERVICE_TOKEN") },
        });
        return { url: backend.url };
      }),
    );
    expect(Effect.isEffect(stack)).toBe(true);
  });

  it("accepts a supplied deployment key without a management token", () => {
    const stack = Alchemy.Stack(
      "Notes",
      { providers: Convex.providers(), state: Alchemy.localState() },
      Effect.gen(function* () {
        const backend = yield* Confect.Backend("Backend", {
          deployment: {
            name: "happy-animal-123",
            url: "https://happy-animal-123.convex.cloud",
          },
          deployKey: yield* Config.Redacted("CONVEX_DEPLOY_KEY"),
        });
        return { url: backend.url };
      }),
    );
    expect(Effect.isEffect(stack)).toBe(true);
  });
});
