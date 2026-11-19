import { Stack } from "alchemy/Stack";
import { State } from "alchemy/State/State";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export class LifecycleStateError extends Schema.TaggedError<
  LifecycleStateError,
  { readonly brand: unique symbol }
>()("LifecycleStateError", { fqn: Schema.String }) {}

export const checkpointResource = Effect.fn("Lifecycle.checkpointResource")(
  function* (fqn: string, instanceId: string, props: object, output?: object) {
    const stack = yield* Effect.serviceOption(Stack);
    if (Option.isNone(stack)) return;
    const state = yield* Effect.serviceOption(State);
    if (Option.isNone(state)) return yield* LifecycleStateError.make({ fqn });
    const store = yield* state.value;
    const key = { stack: stack.value.name, stage: stack.value.stage, fqn };
    const row = yield* store.get(key);
    if (
      row === undefined ||
      row.kind === "action" ||
      row.instanceId !== instanceId
    )
      return yield* LifecycleStateError.make({ fqn });
    if (row.status !== "creating" && row.status !== "updating") return;
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
