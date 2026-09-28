import { it, expect } from "@effect/vitest";
import { Stack } from "alchemy/Stack";
import { InMemoryService } from "alchemy/State/InMemoryState";
import type { ResourceState } from "alchemy/State/ResourceState";
import { State, StateStoreError } from "alchemy/State/State";
import * as Effect from "effect/Effect";
import { checkpointCreate } from "../src/internal/Lifecycle";

const stack = {
  name: "test",
  stage: "test",
  resources: {},
  bindings: {},
  actions: {},
};
const creating = (): ResourceState => ({
  status: "creating",
  fqn: "Key",
  logicalId: "Key",
  instanceId: "instance",
  resourceType: "Convex.DeployKey",
  namespace: undefined,
  providerVersion: 0,
  downstream: ["Backend"],
  bindings: [],
  removalPolicy: "destroy",
  props: {},
});

it.effect(
  "checkpoints resolved inputs and adoption output without changing the original row",
  () =>
    Effect.gen(function* () {
      const original = creating();
      const store = yield* InMemoryService({
        test: { test: { Key: original } },
      });
      const props = { deploymentName: "happy-otter-123" };
      const output = { name: "adopted" };
      yield* checkpointCreate("Key", "instance", props, output).pipe(
        Effect.provideService(Stack, stack),
        Effect.provideService(State, Effect.succeed(store)),
      );
      const saved = yield* store.get({
        stack: "test",
        stage: "test",
        fqn: "Key",
      });
      expect(saved).toEqual({ ...original, props, attr: output });
      expect(original.props).toEqual({});
      expect(original.attr).toBeUndefined();
    }),
);

it.effect("refuses a checkpoint for another resource incarnation", () =>
  Effect.gen(function* () {
    const original = creating();
    const store = yield* InMemoryService({ test: { test: { Key: original } } });
    const error = yield* checkpointCreate("Key", "other-instance", {}).pipe(
      Effect.provideService(Stack, stack),
      Effect.provideService(State, Effect.succeed(store)),
      Effect.flip,
    );
    expect(error._tag).toBe("LifecycleStateError");
    expect(yield* store.get({ stack: "test", stage: "test", fqn: "Key" })).toBe(
      original,
    );
  }),
);

it.effect(
  "propagates checkpoint failures instead of running a cloud mutation",
  () =>
    Effect.gen(function* () {
      const store = yield* InMemoryService({
        test: { test: { Key: creating() } },
      });
      let mutated = false;
      const error = yield* checkpointCreate("Key", "instance", {}).pipe(
        Effect.andThen(
          Effect.sync(() => {
            mutated = true;
          }),
        ),
        Effect.provideService(Stack, stack),
        Effect.provideService(
          State,
          Effect.succeed({
            ...store,
            set: () =>
              Effect.fail(new StateStoreError({ message: "unavailable" })),
          }),
        ),
        Effect.flip,
      );
      expect(error._tag).toBe("StateStoreError");
      expect(mutated).toBe(false);
    }),
);
