import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import type { FunctionImpl, MiddlewareImpl } from "@confect/server";
import { GroupImpl, Registry, type RegistryItems } from "@confect/server";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

describe("GroupImpl.fromSpec", () => {
  it.effect("constructs an unfinalized layer without a database schema", () =>
    Effect.gen(function* () {
      const group = GroupSpec.make();
      const layer = GroupImpl.fromSpec(group);
      expectTypeOf(layer).toEqualTypeOf<
        Layer.Layer<GroupImpl.GroupImpl<"Unfinalized">>
      >();
      const context = yield* Layer.build(layer).pipe(Effect.scoped);
      expect(
        Context.get(
          context,
          GroupImpl.GroupImpl({ finalizationStatus: "Unfinalized" }),
        ),
      ).toMatchObject({
        finalizationStatus: "Unfinalized",
        registeredFunctionNames: [],
        registeredMiddlewareKeys: [],
      });
    }),
  );

  it("retains function and middleware requirements until provided", () => {
    class Observe extends MiddlewareSpec.MiddlewareSpec<Observe>()("Observe", {
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const group = GroupSpec.make()
      .middleware(Observe)
      .addFunction(
        FunctionSpec.publicQuery({ name: "read", returns: () => Schema.Null }),
      );
    const layer = GroupImpl.fromSpec(group);
    expectTypeOf<Layer.Services<typeof layer>>().toEqualTypeOf<
      | FunctionImpl.FunctionImpl<"read">
      | MiddlewareImpl.MiddlewareImpl<"Observe">
    >();
  });

  it("rejects unsatisfied function middleware requirements", () => {
    class Viewer extends Context.Service<Viewer, { readonly name: string }>()(
      "@confect/server/test/GroupImpl.test/Viewer",
    ) {}
    class NeedsViewer extends MiddlewareSpec.MiddlewareSpec<
      NeedsViewer,
      { requires: Viewer }
    >()("NeedsViewer", {
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const group = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "read",
        returns: () => Schema.Null,
      }).middleware(NeedsViewer),
    );
    expectTypeOf<typeof group>().not.toExtend<
      Parameters<typeof GroupImpl.fromSpec<typeof group>>[0]
    >();
  });

  it.effect("retains finalization and isolated registry behavior", () =>
    Effect.gen(function* () {
      const registry = yield* Ref.make<RegistryItems.RegistryItems>({});
      const group = GroupSpec.make();
      const context = yield* Layer.build(
        GroupImpl.fromSpec(group).pipe(GroupImpl.finalize),
      ).pipe(Effect.provideService(Registry.Registry, registry), Effect.scoped);
      expect(
        Context.get(
          context,
          GroupImpl.GroupImpl({ finalizationStatus: "Finalized" }),
        ),
      ).toMatchObject({
        finalizationStatus: "Finalized",
        registeredFunctionNames: [],
        registeredMiddlewareKeys: [],
      });
      expect(yield* Ref.get(registry)).toEqual({});
    }),
  );
});
