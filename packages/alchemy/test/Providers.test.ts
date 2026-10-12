import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { Convex } from "@confect/alchemy";
import { Providers } from "@confect/alchemy/Providers";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect } from "@effect/vitest";

describe("providers", () => {
  it.effect("registers every resource without management credentials", () =>
    Effect.gen(function* () {
      const collection = yield* Providers;
      for (const resource of [
        Convex.Project,
        Convex.Deployment,
        Convex.DeployKey,
        Convex.EnvironmentVariables,
        Convex.Code,
      ]) {
        const provider = collection.get(resource.Type);
        expect(provider).toBeDefined();
        expect(typeof provider?.reconcile).toBe("function");
        expect(typeof provider?.delete).toBe("function");
      }
    }).pipe(
      Effect.provide(
        Convex.providers().pipe(
          Layer.provide(NodeServices.layer),
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
        ),
      ),
    ),
  );
});
