import {
  FunctionImpl,
  GroupImpl,
  MiddlewareImpl,
  RegisteredConvexFunction,
  RegisteredFunctions,
} from "@confect/server";
import type * as DatabaseReaderModule from "@confect/server/DatabaseReader";
import type * as DatabaseWriterModule from "@confect/server/DatabaseWriter";
import type * as Handler from "@confect/server/Handler";
import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { Effect as EffectNamespace } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import databaseSchema from "./mock-backend/fixtures/confect/_generated/schema";
import type { NoViewer } from "./mock-backend/fixtures/confect/middleware/ProvideViewer.spec";
import ProvideViewer, {
  Viewer,
} from "./mock-backend/fixtures/confect/middleware/ProvideViewer.spec";

const viewerName = FunctionSpec.publicQuery({
  name: "viewerName",
  returns: () => Schema.String,
});

const coveredGroup = GroupSpec.make()
  .middleware(ProvideViewer)
  .addFunction(viewerName);

const bareGroup = GroupSpec.make().addFunction(viewerName);

type HandlerFor<Group extends GroupSpec.AnyWithProps> = Handler.WithName<
  typeof databaseSchema,
  GroupSpec.Functions<Group>,
  "viewerName",
  MiddlewareSpec.Provides<GroupSpec.MiddlewareSpecs<Group>>
>;

type EnvironmentOf<H> = H extends (
  args: never,
) => EffectNamespace.Effect<any, any, infer R>
  ? R
  : never;

describe("implementation options", () => {
  class GroupPolicy extends MiddlewareSpec.MiddlewareSpec<GroupPolicy>()(
    "GroupPolicy",
    {
      options: () => Schema.Struct({ label: Schema.String }),
      functionTypes: { query: true, mutation: true, action: true },
    },
  ) {}

  class FunctionPolicy extends MiddlewareSpec.MiddlewareSpec<FunctionPolicy>()(
    "FunctionPolicy",
    {
      options: () => Schema.Struct({ tolerateMissing: Schema.Boolean }),
      functionTypes: { query: true, mutation: true, action: true },
    },
  ) {}

  class Observe extends MiddlewareSpec.MiddlewareSpec<Observe>()("Observe", {
    functionTypes: { query: true, mutation: true, action: true },
  }) {}

  it("types options for the common implementation strategy", () => {
    MiddlewareImpl.make(
      databaseSchema,
      GroupPolicy,
      (effect, { options, invocation }) => {
        expectTypeOf(options).toEqualTypeOf<{
          readonly label: string;
        }>();
        expectTypeOf(invocation).toEqualTypeOf<{
          readonly name: string;
          readonly functionType: "query" | "mutation" | "action";
          readonly functionVisibility: "public" | "internal";
          readonly args: unknown;
        }>();
        return effect;
      },
    );
  });

  it("types options for each function-type implementation", () => {
    MiddlewareImpl.makeByFunctionType(databaseSchema, FunctionPolicy, {
      query: (effect, { options }) => {
        expectTypeOf(options).toEqualTypeOf<{
          readonly tolerateMissing: boolean;
        }>();
        return effect;
      },
      mutation: (effect, { options }) => {
        expectTypeOf(options).toEqualTypeOf<{
          readonly tolerateMissing: boolean;
        }>();
        return effect;
      },
      action: (effect, { options }) => {
        expectTypeOf(options).toEqualTypeOf<{
          readonly tolerateMissing: boolean;
        }>();
        return effect;
      },
    });
  });

  it("omits options from the context type for optionless middleware", () => {
    MiddlewareImpl.make(databaseSchema, Observe, (effect, context) => {
      expectTypeOf<keyof typeof context>().toEqualTypeOf<"invocation">();
      expectTypeOf(context.invocation).toEqualTypeOf<
        MiddlewareSpec.MiddlewareOptions["invocation"]
      >();
      return effect;
    });
  });

  it("retains the options field when a declared schema accepts undefined", () => {
    class UndefinedPolicy extends MiddlewareSpec.MiddlewareSpec<UndefinedPolicy>()(
      "UndefinedPolicy",
      {
        options: () => Schema.Undefined,
        functionTypes: { query: true, mutation: true, action: true },
      },
    ) {}

    MiddlewareImpl.make(databaseSchema, UndefinedPolicy, (effect, context) => {
      expectTypeOf<keyof typeof context>().toEqualTypeOf<
        "options" | "invocation"
      >();
      expectTypeOf(context.options).toBeUndefined();
      return effect;
    });
    MiddlewareImpl.makeByFunctionType(databaseSchema, UndefinedPolicy, {
      query: (effect, { options }) => {
        expectTypeOf(options).toBeUndefined();
        return effect;
      },
      mutation: (effect, { options }) => {
        expectTypeOf(options).toBeUndefined();
        return effect;
      },
      action: (effect, { options }) => {
        expectTypeOf(options).toBeUndefined();
        return effect;
      },
    });
  });

  it("allows invocation-only callbacks with either implementation strategy", () => {
    MiddlewareImpl.make(databaseSchema, Observe, (effect, { invocation }) => {
      expectTypeOf(invocation).toEqualTypeOf<
        MiddlewareSpec.MiddlewareOptions["invocation"]
      >();
      return effect;
    });
    MiddlewareImpl.makeByFunctionType(databaseSchema, Observe, {
      query: (effect, context) => {
        expectTypeOf<keyof typeof context>().toEqualTypeOf<"invocation">();
        expectTypeOf(context.invocation).toEqualTypeOf<
          MiddlewareSpec.MiddlewareOptions["invocation"]
        >();
        return effect;
      },
      mutation: (effect, context) => {
        expectTypeOf<keyof typeof context>().toEqualTypeOf<"invocation">();
        expectTypeOf(context.invocation).toEqualTypeOf<
          MiddlewareSpec.MiddlewareOptions["invocation"]
        >();
        return effect;
      },
      action: (effect, context) => {
        expectTypeOf<keyof typeof context>().toEqualTypeOf<"invocation">();
        expectTypeOf(context.invocation).toEqualTypeOf<
          MiddlewareSpec.MiddlewareOptions["invocation"]
        >();
        return effect;
      },
    });
  });
});

describe("handler environment widening", () => {
  it("accepts handlers consuming a service provided by an attached middleware", () => {
    FunctionImpl.make(databaseSchema, coveredGroup, "viewerName", () =>
      Effect.gen(function* () {
        const viewer = yield* Viewer;

        return viewer.username;
      }),
    );
  });

  it("widens the handler environment with middleware provides exactly when attached", () => {
    expectTypeOf<
      Extract<EnvironmentOf<HandlerFor<typeof coveredGroup>>, Viewer>
    >().toEqualTypeOf<Viewer>();
    expectTypeOf<
      Extract<EnvironmentOf<HandlerFor<typeof bareGroup>>, Viewer>
    >().toBeNever();
  });

  it("widens the handler environment with function-level middleware provides", () => {
    const functionCoveredGroup = GroupSpec.make().addFunction(
      viewerName.middleware(ProvideViewer),
    );

    type FunctionLevelExtra = MiddlewareSpec.Provides<
      FunctionSpec.MiddlewareSpecs<
        GroupSpec.Functions<typeof functionCoveredGroup>
      >
    >;

    expectTypeOf<FunctionLevelExtra>().toEqualTypeOf<Viewer>();

    FunctionImpl.make(databaseSchema, functionCoveredGroup, "viewerName", () =>
      Effect.gen(function* () {
        const viewer = yield* Viewer;

        return viewer.username;
      }),
    );
  });
});

describe("cross-middleware requires", () => {
  class NeedsViewer extends MiddlewareSpec.MiddlewareSpec<
    NeedsViewer,
    { requires: Viewer }
  >()("NeedsViewer", {
    functionTypes: { query: true, mutation: true, action: true },
  }) {}

  it("lets an implementation consume its declared requires", () => {
    MiddlewareImpl.make(databaseSchema, NeedsViewer, (effect) =>
      Effect.gen(function* () {
        const viewer = yield* Viewer;

        return viewer.username.length > 0 ? yield* effect : yield* effect;
      }),
    );
  });

  it("rejects a group whose function middleware has unsatisfied requires", () => {
    const unsatisfied = GroupSpec.make().addFunction(
      viewerName.middleware(NeedsViewer),
    );

    // @ts-expect-error — nothing covering viewerName provides Viewer
    GroupImpl.make(databaseSchema, unsatisfied);
  });

  it("accepts a group whose provider middleware covers the requirement", () => {
    const satisfied = GroupSpec.make()
      .middleware(ProvideViewer)
      .addFunction(viewerName.middleware(NeedsViewer));

    GroupImpl.make(databaseSchema, satisfied);
  });
});

describe("function-level implementation requirements", () => {
  it("requires implementations for function-level middleware too", () => {
    const functionCoveredGroup = GroupSpec.make().addFunction(
      viewerName.middleware(ProvideViewer),
    );

    expectTypeOf<
      MiddlewareImpl.FromGroupSpec<typeof functionCoveredGroup>
    >().toEqualTypeOf<MiddlewareImpl.MiddlewareImpl<"ProvideViewer">>();
  });
});

describe("implementation service bounds", () => {
  type ReaderService = DatabaseReaderModule.DatabaseReader<
    typeof databaseSchema
  >;
  type WriterService = DatabaseWriterModule.DatabaseWriter<
    typeof databaseSchema
  >;

  type AllFunctionTypes = MiddlewareImpl.CommonServices<
    typeof databaseSchema,
    "query" | "mutation" | "action"
  >;
  type QueryMutation = MiddlewareImpl.CommonServices<
    typeof databaseSchema,
    "query" | "mutation"
  >;
  type MutationOnly = MiddlewareImpl.CommonServices<
    typeof databaseSchema,
    "mutation"
  >;

  it("bounds all-function-types middleware to the auth/storage/runQuery intersection", () => {
    expectTypeOf<Extract<AllFunctionTypes, ReaderService>>().toBeNever();
    expectTypeOf<Extract<AllFunctionTypes, WriterService>>().toBeNever();
  });

  it("allows the database reader for query+mutation middleware, but never the writer", () => {
    expectTypeOf<
      Extract<QueryMutation, ReaderService>
    >().toEqualTypeOf<ReaderService>();
    expectTypeOf<Extract<QueryMutation, WriterService>>().toBeNever();
  });

  it("gives single-function-type middleware that type's full ctx union", () => {
    expectTypeOf<MutationOnly>().toEqualTypeOf<
      Handler.MutationServices<typeof databaseSchema>
    >();
  });

  it("puts the Provides obligation in the downstream effect's environment", () => {
    // The incoming effect requires `Viewer`, so an implementation that never
    // provides it cannot eliminate the requirement — its output environment
    // would keep `Viewer`, which `CommonServices` excludes.
    type Impl = MiddlewareSpec.MiddlewareImpl<Viewer, NoViewer, never>;
    type IncomingEnvironment =
      Parameters<Impl>[0] extends EffectNamespace.Effect<any, any, infer R>
        ? R
        : never;

    expectTypeOf<IncomingEnvironment>().toEqualTypeOf<Viewer>();
  });

  it("accepts a provides-sugar implementation within the bounds", () => {
    MiddlewareImpl.provides(
      databaseSchema,
      ProvideViewer,
      Viewer,
      Effect.succeed({ username: "static" }),
    );
  });
});

describe("group assembly enforcement", () => {
  const viewerNameImpl = FunctionImpl.make(
    databaseSchema,
    coveredGroup,
    "viewerName",
    () =>
      Effect.gen(function* () {
        const viewer = yield* Viewer;

        return viewer.username;
      }),
  );

  it("keeps the middleware implementation as a layer requirement until provided", () => {
    const missingMiddleware = GroupImpl.make(databaseSchema, coveredGroup).pipe(
      Layer.provide(viewerNameImpl),
    );

    type Requirements =
      typeof missingMiddleware extends Layer.Layer<any, any, infer RIn>
        ? RIn
        : never;

    // `GroupImpl.finalize` demands `RIn = never`, so this leftover
    // requirement is exactly what rejects an unprovided middleware at the
    // impl author's site.
    expectTypeOf<
      Extract<Requirements, MiddlewareImpl.MiddlewareImpl<"ProvideViewer">>
    >().toEqualTypeOf<MiddlewareImpl.MiddlewareImpl<"ProvideViewer">>();
  });

  it("throws at build time when a middleware implementation is missing", () => {
    const missingMiddleware = GroupImpl.make(databaseSchema, coveredGroup).pipe(
      Layer.provide(viewerNameImpl),
    ) as unknown as Layer.Layer<GroupImpl.GroupImpl<"Unfinalized">>;

    expect(() =>
      RegisteredFunctions.buildForGroup<typeof coveredGroup>(
        databaseSchema,
        GroupImpl.finalize(missingMiddleware),
        RegisteredConvexFunction.make,
      ),
    ).toThrowError(
      /Middleware "ProvideViewer" is attached to this group's spec, but no implementation was provided/,
    );
  });

  it("builds registered functions when the middleware implementation is provided", () => {
    const provideViewerLive = MiddlewareImpl.provides(
      databaseSchema,
      ProvideViewer,
      Viewer,
      Effect.succeed({ username: "static" }),
    );

    const registered = RegisteredFunctions.buildForGroup<typeof coveredGroup>(
      databaseSchema,
      GroupImpl.make(databaseSchema, coveredGroup).pipe(
        Layer.provide(viewerNameImpl),
        Layer.provide(provideViewerLive),
        GroupImpl.finalize,
      ),
      RegisteredConvexFunction.make,
    );

    expect(registered.viewerName).toBeDefined();
  });
});

describe("registry key namespacing", () => {
  it("registers a middleware keyed like a function name without collision", () => {
    class Clash extends MiddlewareSpec.MiddlewareSpec<Clash>()("clash", {
      functionTypes: { query: true, mutation: true, action: true },
    }) {}

    const clashFunction = FunctionSpec.publicQuery({
      name: "clash",
      returns: () => Schema.String,
    });

    const group = GroupSpec.make().middleware(Clash).addFunction(clashFunction);

    const groupLayer = GroupImpl.make(databaseSchema, group).pipe(
      Layer.provide(
        FunctionImpl.make(databaseSchema, group, "clash", () =>
          Effect.succeed("ok"),
        ),
      ),
      Layer.provide(
        MiddlewareImpl.make(databaseSchema, Clash, (effect) => effect),
      ),
      GroupImpl.finalize,
    );

    const registered = RegisteredFunctions.buildForGroup<typeof group>(
      databaseSchema,
      groupLayer,
      RegisteredConvexFunction.make,
    );

    expect(registered.clash).toBeDefined();
  });
});
