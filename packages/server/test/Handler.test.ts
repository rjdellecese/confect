import { FunctionSpec } from "@confect/core";
import { describe, expectTypeOf, it } from "@effect/vitest";
import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ExecutionMetadata } from "@confect/server/ExecutionMetadata";
import type * as Handler from "@confect/server/Handler";
import type * as HttpRouter from "@confect/server/HttpRouter";
import type { RequestMetadata } from "@confect/server/RequestMetadata";
import type { TransactionMetadata } from "@confect/server/TransactionMetadata";
import type { QueryTransactionContext } from "@confect/server/QueryTransactionContext";
import type { MutationTransactionContext } from "@confect/server/MutationTransactionContext";
import * as Storage from "@confect/server/Storage";
import type { StorageReader } from "@confect/server/StorageReader";
import type { StorageWriter } from "@confect/server/StorageWriter";
import type { StorageActionWriter } from "@confect/server/StorageActionWriter";
import type { BlobNotFoundError } from "@confect/server/BlobNotFoundError";
import type { GenericId } from "convex/values";
import type schema from "./mock-backend/fixtures/confect/_generated/schema";
import {
  internalAction,
  mutation,
  query,
} from "./mock-backend/fixtures/convex/_generated/server";

type ExtractQueryReturns<F> =
  F extends RegisteredQuery<any, any, infer R> ? R : never;

type ExtractMutationReturns<F> =
  F extends RegisteredMutation<any, any, infer R> ? R : never;

type ExtractActionReturns<F> =
  F extends RegisteredAction<any, any, infer R> ? R : never;

describe("Handler", () => {
  describe("transaction-control service availability", () => {
    type Controls = QueryTransactionContext | MutationTransactionContext;

    it("permits query controls but rejects mutation controls in queries", () => {
      expectTypeOf<
        Extract<Handler.QueryServices<typeof schema>, Controls>
      >().toEqualTypeOf<QueryTransactionContext>();
      expectTypeOf<MutationTransactionContext>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
      expectTypeOf<
        Effect.Effect<string, never, MutationTransactionContext>
      >().not.toExtend<
        Effect.Effect<string, never, Handler.QueryServices<typeof schema>>
      >();
    });

    it("permits both control services in mutations", () => {
      expectTypeOf<
        Extract<Handler.MutationServices<typeof schema>, Controls>
      >().toEqualTypeOf<Controls>();
    });

    it("rejects transaction controls in both action runtimes and HTTP handlers", () => {
      const action = FunctionSpec.publicAction({
        name: "action",
        returns: () => Schema.Null,
      });
      const nodeAction = FunctionSpec.publicNodeAction({
        name: "nodeAction",
        returns: () => Schema.Null,
      });
      type ActionEnvironment = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof action>>
      >;
      type NodeActionEnvironment = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof nodeAction>>
      >;
      expectTypeOf<Extract<ActionEnvironment, Controls>>().toBeNever();
      expectTypeOf<Extract<NodeActionEnvironment, Controls>>().toBeNever();
      expectTypeOf<Extract<HttpRouter.Services, Controls>>().toBeNever();
      expectTypeOf<
        Effect.Effect<null, never, QueryTransactionContext>
      >().not.toExtend<Effect.Effect<null, never, ActionEnvironment>>();
      expectTypeOf<
        Effect.Effect<null, never, MutationTransactionContext>
      >().not.toExtend<Effect.Effect<null, never, NodeActionEnvironment>>();
      expectTypeOf<Effect.Effect<null, never, Controls>>().not.toExtend<
        Effect.Effect<null, never, HttpRouter.Services>
      >();
    });
  });

  describe("storage capability availability", () => {
    type StorageServices =
      | Storage.Storage
      | StorageReader
      | StorageWriter
      | StorageActionWriter;

    it("preserves legacy services and restricts write capabilities by context", () => {
      expectTypeOf<
        Extract<Handler.QueryServices<typeof schema>, StorageServices>
      >().toEqualTypeOf<Storage.Storage | StorageReader>();
      expectTypeOf<
        Extract<Handler.MutationServices<typeof schema>, StorageServices>
      >().toEqualTypeOf<Storage.Storage | StorageReader | StorageWriter>();
      expectTypeOf<
        Extract<Handler.ActionServices<typeof schema>, StorageServices>
      >().toEqualTypeOf<StorageServices>();
      expectTypeOf<
        Extract<HttpRouter.Services, StorageServices>
      >().toEqualTypeOf<StorageServices>();

      const nodeAction = FunctionSpec.publicNodeAction({
        name: "storage",
        returns: () => Schema.Null,
      });
      type NodeServices = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof nodeAction>>
      >;
      expectTypeOf<
        Extract<NodeServices, StorageServices>
      >().toEqualTypeOf<StorageServices>();
    });

    it("infers only the capabilities and errors required by each operation", () => {
      const id = "storage-id" as GenericId<"_storage">;
      const read = Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        return yield* storage.getUrl(id);
      });
      const upload = Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        return yield* storage.generateUploadUrl;
      });
      const remove = Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        yield* storage.delete(id);
      });
      const get = Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        return yield* storage.get(id);
      });
      const store = Effect.gen(function* () {
        const storage = yield* Storage.Storage;
        return yield* storage.store(new Blob());
      });

      expectTypeOf(read).toEqualTypeOf<
        Effect.Effect<URL, BlobNotFoundError, Storage.Storage>
      >();
      expectTypeOf(upload).toEqualTypeOf<
        Effect.Effect<URL, never, Storage.Storage | StorageWriter>
      >();
      expectTypeOf(remove).toEqualTypeOf<
        Effect.Effect<void, BlobNotFoundError, Storage.Storage | StorageWriter>
      >();
      expectTypeOf(get).toEqualTypeOf<
        Effect.Effect<
          Blob,
          BlobNotFoundError,
          Storage.Storage | StorageActionWriter
        >
      >();
      expectTypeOf(store).toEqualTypeOf<
        Effect.Effect<
          GenericId<"_storage">,
          never,
          Storage.Storage | StorageActionWriter
        >
      >();

      expectTypeOf<Effect.Services<typeof read>>().toExtend<
        Handler.QueryServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof upload>>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof remove>>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof get>>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof store>>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof upload | typeof remove>>().toExtend<
        Handler.MutationServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof get>>().not.toExtend<
        Handler.MutationServices<typeof schema>
      >();
      expectTypeOf<Effect.Services<typeof store>>().not.toExtend<
        Handler.MutationServices<typeof schema>
      >();
      expectTypeOf<
        Effect.Services<
          | typeof read
          | typeof upload
          | typeof remove
          | typeof get
          | typeof store
        >
      >().toExtend<Handler.ActionServices<typeof schema>>();
    });
  });

  describe("metadata service availability", () => {
    type MetadataServices =
      | ExecutionMetadata
      | RequestMetadata
      | TransactionMetadata;

    it("allows execution metadata and transaction metrics in queries", () => {
      expectTypeOf<
        Extract<Handler.QueryServices<typeof schema>, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | TransactionMetadata>();
      expectTypeOf<RequestMetadata>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
    });

    it("allows every metadata service in mutations", () => {
      expectTypeOf<
        Extract<Handler.MutationServices<typeof schema>, MetadataServices>
      >().toEqualTypeOf<MetadataServices>();
    });

    it("allows execution and request metadata but not transactions in both action runtimes", () => {
      const action = FunctionSpec.publicAction({
        name: "action",
        returns: () => Schema.Null,
      });
      const nodeAction = FunctionSpec.publicNodeAction({
        name: "nodeAction",
        returns: () => Schema.Null,
      });
      type ActionEnvironment = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof action>>
      >;
      type NodeActionEnvironment = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof nodeAction>>
      >;

      expectTypeOf<
        Extract<ActionEnvironment, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | RequestMetadata>();
      expectTypeOf<
        Extract<NodeActionEnvironment, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | RequestMetadata>();
      expectTypeOf<TransactionMetadata>().not.toExtend<ActionEnvironment>();
      expectTypeOf<TransactionMetadata>().not.toExtend<NodeActionEnvironment>();
    });

    it("allows execution and request metadata but not transactions in HTTP handlers", () => {
      expectTypeOf<
        Extract<HttpRouter.Services, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | RequestMetadata>();
      expectTypeOf<TransactionMetadata>().not.toExtend<HttpRouter.Services>();
    });
  });

  describe("ConvexProvenanceHandler preserves the raw Convex registered function type", () => {
    it("query", () => {
      const vQueryArgs = { tag: v.string() };
      const _vQueryArgsObject = v.object(vQueryArgs);

      const vQueryReturns = v.array(v.string());

      type QueryArgs = Infer<typeof _vQueryArgsObject>;
      type QueryReturns = Infer<typeof vQueryReturns>;

      const _myQuery = query({
        args: vQueryArgs,
        returns: vQueryReturns,
        handler: () => Effect.runPromise(Effect.succeed(["hello"])),
      });

      const _spec =
        FunctionSpec.convexPublicQuery<typeof _myQuery>()("myQuery");

      type Result = Handler.Handler<typeof schema, typeof _spec>;

      expectTypeOf<Result>().toEqualTypeOf<
        RegisteredQuery<"public", QueryArgs, QueryReturns>
      >();

      type ResultReturns = ExtractQueryReturns<Result>;
      expectTypeOf<ResultReturns>().toEqualTypeOf<Promise<QueryReturns>>();
    });

    it("mutation", () => {
      const vMutationArgs = { id: v.string() };
      const _vMutationArgsObject = v.object(vMutationArgs);

      const vMutationReturns = v.null();

      type MutationArgs = Infer<typeof _vMutationArgsObject>;
      type MutationReturns = Infer<typeof vMutationReturns>;

      const _myMutation = mutation({
        args: vMutationArgs,
        returns: vMutationReturns,
        handler: () => Effect.runPromise(Effect.succeed(null)),
      });

      const _spec =
        FunctionSpec.convexPublicMutation<typeof _myMutation>()("myMutation");

      type Result = Handler.Handler<typeof schema, typeof _spec>;

      expectTypeOf<Result>().toEqualTypeOf<
        RegisteredMutation<"public", MutationArgs, MutationReturns>
      >();

      type ResultReturns = ExtractMutationReturns<Result>;
      expectTypeOf<ResultReturns>().toEqualTypeOf<Promise<MutationReturns>>();
    });

    it("action", () => {
      const vActionArgs = { url: v.string() };
      const _vActionArgsObject = v.object(vActionArgs);

      const vActionReturns = { status: v.number() };
      const _vActionReturnsObject = v.object(vActionReturns);

      type ActionArgs = Infer<typeof _vActionArgsObject>;
      type ActionReturns = Infer<typeof _vActionReturnsObject>;

      const _myAction = internalAction({
        args: vActionArgs,
        returns: vActionReturns,
        handler: () => Effect.runPromise(Effect.succeed({ status: 200 })),
      });

      const _spec =
        FunctionSpec.convexInternalAction<typeof _myAction>()("myAction");

      type Result = Handler.Handler<typeof schema, typeof _spec>;

      expectTypeOf<Result>().toEqualTypeOf<
        RegisteredAction<"internal", ActionArgs, ActionReturns>
      >();

      type ResultReturns = ExtractActionReturns<Result>;
      expectTypeOf<ResultReturns>().toEqualTypeOf<Promise<ActionReturns>>();
    });
  });
});
