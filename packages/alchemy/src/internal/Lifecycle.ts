import { AdoptPolicy } from "alchemy/AdoptPolicy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { Stack } from "alchemy/Stack";
import { State } from "alchemy/State/State";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export class LifecycleStateError extends Schema.TaggedError<LifecycleStateError>()(
  "LifecycleStateError",
  { fqn: Schema.String },
) {}

export const checkpointCreate = Effect.fn("Lifecycle.checkpointCreate")(
  function* (fqn: string, instanceId: string, props: object, output?: object) {
    const stack = yield* Effect.serviceOption(Stack);
    if (Option.isNone(stack)) return;
    const state = yield* Effect.serviceOption(State);
    if (Option.isNone(state)) return yield* new LifecycleStateError({ fqn });
    const store = yield* state.value;
    const key = { stack: stack.value.name, stage: stack.value.stage, fqn };
    const row = yield* store.get(key);
    if (!row || row.kind === "action" || row.instanceId !== instanceId)
      return yield* new LifecycleStateError({ fqn });
    if (row.status !== "creating") return;
    yield* store.set({
      ...key,
      value: {
        ...row,
        props,
        ...(output === undefined ? {} : { attr: output }),
      },
    });
  },
);

export const shouldAdopt = Effect.fn("Lifecycle.shouldAdopt")(function* (
  fqn: string,
) {
  const stack = yield* Effect.serviceOption(Stack);
  const resourcePolicy = Option.isSome(stack)
    ? stack.value.resources[fqn]?.Adopt
    : undefined;
  if (resourcePolicy !== undefined) return resourcePolicy;
  const policy = yield* Effect.serviceOption(AdoptPolicy);
  if (Option.isSome(policy)) return policy.value;
  const context = yield* Effect.serviceOption(AlchemyContext);
  return Option.isSome(context) && context.value.adopt;
});
