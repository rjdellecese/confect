import type * as IdScope from "@confect/core/IdScope";
import type * as Types from "effect/Types";
import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";
import type * as ScopedId from "@confect/core/GenericId";

/**
 * Service for managing uploads in mutations, actions, and HTTP handlers.
 *
 * @remarks
 *   Codegen support: this type describes the generated service. Yield
 *   `StorageWriter` from `confect/_generated/services` to use its operations.
 *
 * @category Services
 */
export type Service<Scope extends IdScope.IdScope = IdScope.App> = {
  /**
   * Effect that creates a temporary upload URL. Yield it without calling it. An
   * invalid URL or Convex rejection is a defect.
   *
   * @category Writing
   */
  generateUploadUrl: ReturnType<typeof make>["generateUploadUrl"];
  /**
   * Deletes a blob by its storage ID in this scope. A Convex rejection fails
   * with {@link BlobNotFoundError}.
   *
   * @category Writing
   */
  delete: (
    id: ScopedId.GenericId<"_storage", Scope>,
  ) => ReturnType<ReturnType<typeof make>["delete"]>;
};
/**
 * Types the generated `StorageWriter` requirement for its database scope. Use
 * the identically named type from `confect/_generated/services`.
 *
 * @internal
 */
export type ForScope<Scope extends IdScope.IdScope> = [Scope] extends [
  IdScope.App,
]
  ? StorageWriter
  : { readonly "~ScopedStorageWriter": Types.Invariant<Scope> };

const make = (storageWriter: ConvexStorageWriter) => ({
  /**
   * Effect that creates a temporary upload URL in a mutation, action, or HTTP
   * handler. Yield `generateUploadUrl` without calling it. An invalid URL or
   * Convex failure is a defect.
   *
   * @category Writing
   */
  generateUploadUrl: Effect.promise(() =>
    storageWriter.generateUploadUrl(),
  ).pipe(
    Effect.andThen((url) =>
      pipe(
        url,
        Schema.decodeEffect(Schema.URLFromString),
        Effect.catchTag("SchemaError", Effect.die),
      ),
    ),
  ),
  /**
   * Deletes a stored blob in a mutation, action, or HTTP handler.
   *
   * @category Writing
   *
   * @param storageId - ID of the blob to delete.
   *
   * @returns An Effect that completes without a value. Any Convex rejection
   *   becomes {@link BlobNotFoundError}.
   */
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => BlobNotFoundError.make({ id: storageId }),
    }),
});

/**
 * Compatibility tag for creating upload URLs and deleting blobs in mutations,
 * actions, and HTTP handlers. Use the generated `Storage` tag in new code.
 *
 * @category Tags
 */
export class StorageWriter extends Context.Service<
  StorageWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageWriter") {
  /**
   * Constructs a scoped tag for codegen. Yield the generated `StorageWriter`
   * tag from `confect/_generated/services` instead.
   *
   * @internal
   */
  static readonly forScope = <
    Scope extends IdScope.IdScope = IdScope.App,
  >(): Context.Service<ForScope<Scope>, Service<Scope>> =>
    Context.Service("@confect/server/StorageWriter");

  /**
   * @internal
   */
  static readonly layer = <Scope extends IdScope.IdScope = IdScope.App>(
    storageWriter: ConvexStorageWriter,
    _scope?: Scope,
  ) =>
    Layer.succeed(
      this.forScope<Scope>(),
      make(storageWriter) as unknown as Service<Scope>,
    );
}
