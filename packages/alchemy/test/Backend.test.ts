import { describe, expect, it } from "@effect/vitest";
import { Backend } from "@confect/alchemy/Backend";
import { Providers } from "@confect/alchemy/Providers";
import * as Output from "alchemy/Output";
import { Stack } from "alchemy/Stack";
import { inMemoryState } from "alchemy/State/InMemoryState";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import { inspect } from "node:util";

const props = {
  deployment: {
    name: "happy-otter-123",
    url: "https://happy-otter-123.convex.cloud",
  },
  deployKey: Redacted.make("prod:happy-otter-123|test-secret"),
};
const stack = () =>
  Layer.succeed(Stack, {
    name: "test",
    stage: "test",
    resources: {},
    bindings: {},
    actions: {},
  });
const providers = Layer.succeed(Providers, {
  kind: "ProviderCollection",
  providers: {},
  get: () => undefined,
});

describe("Backend", () => {
  it.effect(
    "namespaces Code and defaults to the locally installed Confect code generator",
    () =>
      Effect.gen(function* () {
        const first = yield* Backend("First", { ...props, cwd: "/app" });
        const second = yield* Backend("Second", props);
        expect(first.code.FQN).not.toBe(second.code.FQN);
        expect(first.code.LogicalId).toBe("Code");
        expect(first.code.Namespace?.Id).toBe("First");
        expect(first.code.Props).toEqual({
          ...props,
          cwd: "/app",
          prepare: { command: "confect", args: ["codegen"] },
        });
        expect(first.environment).toBeUndefined();
        expect(Object.keys(Output.resolveUpstream(first.url))).toEqual([
          first.code.FQN,
        ]);
        expect(Object.keys(Output.resolveUpstream(first.name))).toEqual([
          first.code.FQN,
        ]);
      }).pipe(Effect.provide([stack(), providers])),
  );

  it.effect("depends on environment values as well as its stable URL", () =>
    Effect.gen(function* () {
      const env = { TOKEN: Redacted.make("environment-secret") };
      const backend = yield* Backend("Backend", { ...props, env });
      const environment = backend.environment;
      expect(environment).toBeDefined();
      if (!environment) return;
      expect(environment.LogicalId).toBe("Environment");
      expect(environment.Namespace?.Id).toBe("Backend");
      expect(environment.Props.variables).toBe(env);
      const url = backend.code.Props.deployment.url;
      expect(Object.keys(Output.resolveUpstream(url))).toEqual([
        environment.FQN,
      ]);
      const expression = inspect(url);
      expect(expression).toContain("variables");
      expect(expression).toContain("url");
      expect(
        yield* Output.evaluate(url, {
          [environment.FQN]: { url: props.deployment.url, variables: {} },
        }),
      ).toBe(props.deployment.url);
      const unresolved = yield* Output.evaluate(url, {}).pipe(Effect.result);
      expect(Result.isFailure(unresolved)).toBe(true);
    }).pipe(Effect.provide([stack(), providers, inMemoryState()])),
  );

  it.effect(
    "registers an explicit empty environment rather than silently dropping ownership",
    () =>
      Effect.gen(function* () {
        const backend = yield* Backend("Backend", { ...props, env: {} });
        expect(backend.environment?.Props.variables).toEqual({});
      }).pipe(Effect.provide([stack(), providers])),
  );
});
