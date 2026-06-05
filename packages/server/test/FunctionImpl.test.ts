import { FunctionSpec, GroupSpec, Registry } from "@confect/core";
import { DatabaseSchema, FunctionImpl, GroupImpl } from "@confect/server";
import { describe, expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

const fnSpec = <const Name extends string>(name: Name) =>
  FunctionSpec.publicQuery({
    name,
    args: () => Schema.Struct({}),
    returns: () => Schema.Null,
  });

const databaseSchema = DatabaseSchema.make({});

// The handler type FunctionImpl.make infers for a strongly-typed DatabaseSchema
// is more specific than the empty `DatabaseSchema.make({})` used here can
// satisfy; the runtime behavior being tested is independent of the handler
// shape, so we cast the placeholder to `never` (a subtype of every expected
// handler type) to keep the test focused on registration.
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

        const layers = Layer.mergeAll(
          FunctionImpl.make(databaseSchema, notes, "insert", handler),
          FunctionImpl.make(databaseSchema, notes, "list", handler),
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
    "registers a group's function without any api or assembled-spec context",
    () =>
      Effect.gen(function* () {
        // Registration consults neither `api` nor the assembled spec tree —
        // only the group's own spec and the function name — so independent
        // groups each register their own function flatly.
        const parent = GroupSpec.make().addFunction(fnSpec("parentFn"));
        const child = GroupSpec.make().addFunction(fnSpec("childFn"));

        const parentRegistry = yield* collectRegistry(
          FunctionImpl.make(databaseSchema, parent, "parentFn", handler),
        );
        const childRegistry = yield* collectRegistry(
          FunctionImpl.make(databaseSchema, child, "childFn", handler),
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

        const groupLayer = GroupImpl.make(databaseSchema, notes).pipe(
          Layer.provide(
            FunctionImpl.make(databaseSchema, notes, "insert", handler),
          ),
          Layer.provide(
            FunctionImpl.make(databaseSchema, notes, "list", handler),
          ),
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
