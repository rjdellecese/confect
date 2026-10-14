import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import { assert, describe, expect, it } from "@effect/vitest";
import * as Convex from "convex/server";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

vi.mock("convex/server", (importOriginal) =>
  importOriginal<typeof Convex>().then((original) => ({
    ...original,
    queryGeneric: vi.fn(original.queryGeneric),
    internalQueryGeneric: vi.fn(original.internalQueryGeneric),
    mutationGeneric: vi.fn(original.mutationGeneric),
    internalMutationGeneric: vi.fn(original.internalMutationGeneric),
    actionGeneric: vi.fn(original.actionGeneric),
    internalActionGeneric: vi.fn(original.internalActionGeneric),
  })),
);

describe("make", () => {
  const options = {
    name: "get",
    args: () => ({ value: Schema.String }),
    returns: () => Schema.String,
  };
  it.each([
    {
      name: "public query",
      spec: FunctionSpec.publicQuery(options),
      register: Convex.queryGeneric,
    },
    {
      name: "internal query",
      spec: FunctionSpec.internalQuery(options),
      register: Convex.internalQueryGeneric,
    },
    {
      name: "public mutation",
      spec: FunctionSpec.publicMutation(options),
      register: Convex.mutationGeneric,
    },
    {
      name: "internal mutation",
      spec: FunctionSpec.internalMutation(options),
      register: Convex.internalMutationGeneric,
    },
    {
      name: "public action",
      spec: FunctionSpec.publicAction(options),
      register: Convex.actionGeneric,
    },
    {
      name: "internal action",
      spec: FunctionSpec.internalAction(options),
      register: Convex.internalActionGeneric,
    },
  ])(
    "preserves validators and registration when wrapping a $name handler",
    ({ spec, register }) => {
      const handler = () => Effect.succeed("ok");
      const item = FunctionRegistryItem.make({
        functionSpec: spec,
        groupMiddlewareAttachments: [],
        handler,
      });
      assert(item._tag === "Confect");
      const database = DatabaseSchema.make({});
      const registration = vi.mocked(register);
      registration.mockClear();
      const wrappedHandlers =
        vi.fn<(original: unknown, wrapped: unknown) => void>();
      const wrapper: RegisteredConvexFunction.HandlerWrapper = (original) => {
        const forward: typeof original = (ctx, args) => original(ctx, args);
        wrappedHandlers(original, forward);
        return forward;
      };
      RegisteredConvexFunction.make(database, item);
      RegisteredConvexFunction.make(database, item, [], wrapper);
      expect(registration).toHaveBeenCalledTimes(2);
      expect(wrappedHandlers).toHaveBeenCalledOnce();
      const [plainCall, wrappedCall] = registration.mock.calls;
      assert(plainCall && wrappedCall);
      const [plain] = plainCall;
      const [wrapped] = wrappedCall;
      assert(typeof plain !== "function" && typeof wrapped !== "function");
      expect(wrapped.args).toEqual(plain.args);
      expect(wrapped.returns).toEqual(plain.returns);
      expect(wrapped.handler).toBe(wrappedHandlers.mock.calls[0]?.[1]);
      expect(wrapped.handler).not.toBe(wrappedHandlers.mock.calls[0]?.[0]);
      expect(item.handler).toBe(handler);
    },
  );
});
