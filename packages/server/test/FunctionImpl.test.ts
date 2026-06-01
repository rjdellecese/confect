import { FunctionSpec, GroupSpec, Registry, Spec } from "@confect/core";
import { DatabaseSchema, FunctionImpl, GroupImpl } from "@confect/server";
import * as Api from "@confect/server/Api";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref, Schema } from "effect";

const fnSpec = (name: string) =>
  FunctionSpec.publicQuery({
    name,
    args: Schema.Struct({}),
    returns: Schema.Null,
  });

const buildApi = (spec: Spec.AnyWithProps): Api.AnyWithProps =>
  Api.make(DatabaseSchema.make({}), spec) as unknown as Api.AnyWithProps;

// The handler type FunctionImpl.make infers for a strongly-typed Api is more
// specific than the erased `Api.AnyWithProps` casts in this file can satisfy;
// the runtime behavior being tested here is independent of the handler shape,
// so we cast the placeholder to `never` (a subtype of every expected handler
// type) to keep the test focused on path resolution.
const handler = (() => Effect.succeed(null)) as never;

/**
 * Build every provided layer with a single shared `Registry` so the writes
 * performed by each `FunctionImpl.make` initializer are observable. Returns
 * the final `RegistryItems` tree.
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
    "resolves a parent leaf's path even when codegen wrapped it in addGroupAt",
    () =>
      Effect.gen(function* () {
        // Mirrors the bug from ISSUE.md: codegen wraps the imported `parent`
        // leaf in `parent.addGroupAt("child", parentChild)`, producing a
        // fresh JS object in the assembled tree. Before this change, the
        // impl's `FunctionImpl.make(api, parent, ...)` failed because the
        // assembled tree no longer contained `parent` by `===`.
        const parent = GroupSpec.make().addFunction(fnSpec("parentFn"));
        const parentChild = GroupSpec.make().addFunction(fnSpec("childFn"));

        const spec = Spec.make()
          .addPath(parent, "parent")
          .addPath(parentChild, "parent.child")
          .addAt("parent", parent.addGroupAt("child", parentChild));
        const api = buildApi(spec);

        const layers = Layer.mergeAll(
          FunctionImpl.make(api, parent, "parentFn", handler),
          FunctionImpl.make(api, parentChild, "childFn", handler),
        );

        const registry = yield* collectRegistry(layers);

        const parentNode = (registry as Record<string, unknown>).parent as
          | Record<string, unknown>
          | undefined;
        expect(parentNode).toBeDefined();
        expect(parentNode?.parentFn).toBeDefined();

        const childNode = parentNode?.child as
          | Record<string, unknown>
          | undefined;
        expect(childNode).toBeDefined();
        expect(childNode?.childFn).toBeDefined();
      }),
  );

  it("throws a helpful error when the spec has no registered path", () => {
    const orphan = GroupSpec.makeAt("orphan").addFunction(fnSpec("orphanFn"));
    // Add the group to the tree but deliberately omit `.addPath` so the
    // runtime resolver cannot find a registered path. This mirrors the
    // failure mode a codegen-generated `_generated/spec.ts` would produce
    // if its `.addPath(...)` line was missing.
    const spec = Spec.make().add(orphan);
    const api = buildApi(spec);

    expect(() =>
      FunctionImpl.make(api, orphan, "orphanFn", handler),
    ).toThrowError(/Spec\.addPath/);
  });
});

describe("GroupImpl.make", () => {
  it("resolves a parent leaf's path even when codegen wrapped it in addGroupAt", () => {
    // Same shape as the FunctionImpl regression: GroupImpl.make also reads
    // the path from api.spec.paths, so it must succeed for parent leaves
    // that were re-wrapped during tree assembly.
    const parent = GroupSpec.make().addFunction(fnSpec("parentFn"));
    const parentChild = GroupSpec.make().addFunction(fnSpec("childFn"));

    const spec = Spec.make()
      .addPath(parent, "parent")
      .addPath(parentChild, "parent.child")
      .addAt("parent", parent.addGroupAt("child", parentChild));
    const api = buildApi(spec);

    expect(() => GroupImpl.make(api, parent)).not.toThrow();
    expect(() => GroupImpl.make(api, parentChild)).not.toThrow();
  });

  it("throws a helpful error when the spec has no registered path", () => {
    const orphan = GroupSpec.make();
    const spec = Spec.make().addAt("parent", orphan);
    const api = buildApi(spec);

    expect(() => GroupImpl.make(api, orphan)).toThrowError(/Spec\.addPath/);
  });
});
