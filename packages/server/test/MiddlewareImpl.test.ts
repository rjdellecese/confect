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
import type { NoViewer } from "./mock-backend/fixtures/confect/groups/middleware.spec";
import {
  ProvideViewer,
  Viewer,
} from "./mock-backend/fixtures/confect/groups/middleware.spec";

const viewerName = FunctionSpec.publicQuery({
  name: "viewerName",
  args: () => Schema.Struct({}),
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
  MiddlewareSpec.Provides<GroupSpec.Middlewares<Group>>
>;

type EnvironmentOf<H> = H extends (
  args: never,
) => EffectNamespace.Effect<any, any, infer R>
  ? R
  : never;

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
      | GroupSpec.Middlewares<typeof functionCoveredGroup>
      | FunctionSpec.Middlewares<
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
  class NeedsViewer extends MiddlewareSpec.Service<
    NeedsViewer,
    { requires: Viewer }
  >()("NeedsViewer") {}

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

  type AllKinds = MiddlewareImpl.CommonServices<
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

  it("bounds all-functionTypes middleware to the auth/storage/runQuery intersection", () => {
    expectTypeOf<Extract<AllKinds, ReaderService>>().toBeNever();
    expectTypeOf<Extract<AllKinds, WriterService>>().toBeNever();
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
    type Impl = MiddlewareSpec.Middleware<Viewer, NoViewer, never>;
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
