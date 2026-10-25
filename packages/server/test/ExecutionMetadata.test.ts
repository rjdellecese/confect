import { ExecutionMetadata as BarrelExecutionMetadata } from "@confect/server";
import * as ExecutionMetadata from "@confect/server/ExecutionMetadata";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type {
  DeploymentMetadata,
  FunctionMetadata,
  QueryMeta,
} from "convex/server";
import * as Effect from "effect/Effect";
import { vi } from "vitest";

describe("ExecutionMetadata", () => {
  it("exports the same service through the barrel and leaf module", () => {
    expect(BarrelExecutionMetadata.ExecutionMetadata).toBe(
      ExecutionMetadata.ExecutionMetadata,
    );
    expectTypeOf<ExecutionMetadata.FunctionMetadata>().toEqualTypeOf<FunctionMetadata>();
    expectTypeOf<ExecutionMetadata.DeploymentMetadata>().toEqualTypeOf<DeploymentMetadata>();
  });

  it.effect(
    "reads native payloads lazily and freshly with the original receiver",
    () => {
      const firstFunction: FunctionMetadata = {
        name: "messages:list",
        componentPath: "",
        type: "query",
        visibility: "public",
      };
      const nextFunction: FunctionMetadata = {
        ...firstFunction,
        name: "messages:get",
      };
      const firstDeployment: DeploymentMetadata = {
        name: "local-test",
        region: null,
        class: "s16",
      };
      const nextDeployment: DeploymentMetadata = {
        name: "test-deployment",
        region: "aws-us-east-1",
        class: "d1024",
      };
      const getFunctionMetadata = vi
        .fn<QueryMeta["getFunctionMetadata"]>()
        .mockResolvedValueOnce(firstFunction)
        .mockResolvedValueOnce(nextFunction);
      const getDeploymentMetadata = vi
        .fn<QueryMeta["getDeploymentMetadata"]>()
        .mockResolvedValueOnce(firstDeployment)
        .mockResolvedValueOnce(nextDeployment);
      const meta = {
        getFunctionMetadata,
        getDeploymentMetadata,
      } satisfies Pick<
        QueryMeta,
        "getFunctionMetadata" | "getDeploymentMetadata"
      >;
      const layer = ExecutionMetadata.layer(meta);

      expect(getFunctionMetadata).not.toHaveBeenCalled();
      expect(getDeploymentMetadata).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const metadata = yield* ExecutionMetadata.ExecutionMetadata;
        const getFunction = metadata.getFunction();
        const getDeployment = metadata.getDeployment();

        expectTypeOf(getFunction).toEqualTypeOf<
          Effect.Effect<FunctionMetadata>
        >();
        expectTypeOf(getDeployment).toEqualTypeOf<
          Effect.Effect<DeploymentMetadata>
        >();
        expect(getFunctionMetadata).not.toHaveBeenCalled();
        expect(getDeploymentMetadata).not.toHaveBeenCalled();
        expect(yield* getFunction).toBe(firstFunction);
        expect(yield* getFunction).toBe(nextFunction);
        expect(yield* getDeployment).toBe(firstDeployment);
        expect(yield* getDeployment).toBe(nextDeployment);
        expect(getFunctionMetadata).toHaveBeenCalledTimes(2);
        expect(getDeploymentMetadata).toHaveBeenCalledTimes(2);
        expect(getFunctionMetadata.mock.contexts[0]).toBe(meta);
        expect(getFunctionMetadata.mock.contexts[1]).toBe(meta);
        expect(getDeploymentMetadata.mock.contexts[0]).toBe(meta);
        expect(getDeploymentMetadata.mock.contexts[1]).toBe(meta);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("preserves rejected native promises as defects", () => {
    const functionFailure = new Error("Function metadata unavailable");
    const deploymentFailure = new Error("Deployment metadata unavailable");
    const meta = {
      getFunctionMetadata: () => Promise.reject(functionFailure),
      getDeploymentMetadata: () => Promise.reject(deploymentFailure),
    } satisfies Pick<
      QueryMeta,
      "getFunctionMetadata" | "getDeploymentMetadata"
    >;

    return Effect.gen(function* () {
      const metadata = yield* ExecutionMetadata.ExecutionMetadata;
      expect(
        yield* metadata.getFunction().pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(functionFailure);
      expect(
        yield* metadata
          .getDeployment()
          .pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(deploymentFailure);
    }).pipe(Effect.provide(ExecutionMetadata.layer(meta)));
  });
});
