import { FunctionSpec, GroupSpec, Registry, Spec } from "@confect/core";
import { DatabaseSchema, FunctionImpl, GroupImpl } from "@confect/server";
import * as Api from "@confect/server/Api";
import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Layer, Ref, Schema } from "effect";

const fnSpec = <const Name extends string>(name: Name) =>
  FunctionSpec.publicQuery({
    name,
    args: () => Schema.Struct({}),
    returns: () => Schema.Null,
  });

const buildApi = (spec: Spec.AnyWithProps): Api.AnyWithProps =>
  Api.make(DatabaseSchema.make({}), spec) as unknown as Api.AnyWithProps;

// The handler type FunctionImpl.make infers for a strongly-typed Api is more
// specific than the erased `Api.AnyWithProps` casts in this file can satisfy;
// the runtime behavior being tested here is independent of the handler shape,
// so we cast the placeholder to `never` (a subtype of every expected handler
// type) to keep the test focused on registration.
const handler = (() => Effect.succeed(null)) as never;

/**
 * Build a layer against a fresh, isolated `Registry` (mirroring how
 * `RegisteredFunctions.buildForGroup` and the CLI's `validateImpl` build a
 * group's impl layer) and return the resulting `RegistryItems` tree.
 */
const collectRegistry = <RIn>(
  layer: Layer.Layer<RIn, never, never>,
): Effect.Effect<Registry.RegistryItems> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<Registry.RegistryItems>({});
    yield* Layer.build(layer).pipe(
      Effect.scoped,
      Effect.provideService(Registry.Registry, ref),
    );
    return yield* Ref.get(ref);
  });

describe("FunctionImpl.make", () => {
  it.effect(
    "registers each function under a flat, single-segment name key",
    () =>
      Effect.gen(function* () {
        const notes = GroupSpec.make()
          .addFunction(fnSpec("insert"))
          .addFunction(fnSpec("list"));
        const api = buildApi(Spec.make().addAt("notes", notes));

        const layers = Layer.mergeAll(
          FunctionImpl.make(api, notes, "insert", handler),
          FunctionImpl.make(api, notes, "list", handler),
        );

        const registry = yield* collectRegistry(layers);

        // No project-wide dot-path nesting: functions live at the top level
        // of their group's isolated registry, keyed by their own name.
        expect(Object.keys(registry).sort()).toEqual(["insert", "list"]);
        expect((registry as Record<string, unknown>).insert).toBeDefined();
        expect((registry as Record<string, unknown>).list).toBeDefined();
      }),
  );

  it.effect(
    "needs no registered group path — a leaf wrapped in addGroupAt still registers",
    () =>
      Effect.gen(function* () {
        // Codegen wraps a parent leaf as `parent.addGroupAt("child", child)`,
        // producing a fresh tree object. Registration no longer consults the
        // assembled tree at all, so the impl's own `parent`/`child` references
        // register without any path lookup.
        const parent = GroupSpec.make().addFunction(fnSpec("parentFn"));
        const child = GroupSpec.make().addFunction(fnSpec("childFn"));
        const api = buildApi(
          Spec.make().addAt("parent", parent.addGroupAt("child", child)),
        );

        const parentRegistry = yield* collectRegistry(
          FunctionImpl.make(api, parent, "parentFn", handler),
        );
        const childRegistry = yield* collectRegistry(
          FunctionImpl.make(api, child, "childFn", handler),
        );

        expect(Object.keys(parentRegistry)).toEqual(["parentFn"]);
        expect(Object.keys(childRegistry)).toEqual(["childFn"]);
      }),
  );
});

describe("GroupImpl.finalize", () => {
  it.effect(
    "snapshots the names of every function registered into the group",
    () =>
      Effect.gen(function* () {
        const notes = GroupSpec.make()
          .addFunction(fnSpec("insert"))
          .addFunction(fnSpec("list"));
        const api = buildApi(Spec.make().addAt("notes", notes));

        const groupLayer = GroupImpl.make(api, notes).pipe(
          Layer.provide(FunctionImpl.make(api, notes, "insert", handler)),
          Layer.provide(FunctionImpl.make(api, notes, "list", handler)),
          GroupImpl.finalize,
        );

        const registeredFunctionNames = yield* Effect.gen(function* () {
          const ref = yield* Ref.make<Registry.RegistryItems>({});
          const context = yield* Layer.build(groupLayer).pipe(
            Effect.provideService(Registry.Registry, ref),
          );
          return Context.get(
            context,
            GroupImpl.GroupImpl({ finalizationStatus: "Finalized" }),
          ).registeredFunctionNames;
        }).pipe(Effect.scoped);

        expect([...registeredFunctionNames].sort()).toEqual(["insert", "list"]);
      }),
  );
});
