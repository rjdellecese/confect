import type * as IdScope from "@confect/core/IdScope";
import type * as Types from "effect/Types";
import type { StorageActionWriter as ConvexStorageActionWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { BlobNotFoundError } from "./BlobNotFoundError";
import type * as ScopedId from "@confect/core/GenericId";

/**
 * Service for reading and storing blobs in mutations, actions, and HTTP
 * handlers.
 *
 * @remarks
 *   Codegen support: this type describes the generated service. Yield
 *   `StorageActionWriter` from `confect/_generated/services` to use its
 *   operations.
 *
 * @category Services
 */
export type Service<Scope extends IdScope.IdScope = IdScope.App> = {
  /**
   * Reads the contents of a stored blob by ID in this scope. A missing blob
   * fails with {@link BlobNotFoundError}; a Convex rejection is a defect.
   *
   * @category Reading
   */
  get: (
    id: ScopedId.GenericId<"_storage", Scope>,
  ) => ReturnType<ReturnType<typeof make>["get"]>;
  /**
   * Stores a blob and returns its storage ID in this scope. Supply a `sha256`
   * checksum for Convex to verify. A Convex rejection is a defect.
   *
   * @category Writing
   */
  store: (
    blob: Blob,
    options?: { sha256?: string },
  ) => Effect.Effect<ScopedId.GenericId<"_storage", Scope>>;
};
/**
 * Types the generated `StorageActionWriter` requirement for its database scope.
 * Use the identically named type from `confect/_generated/services`.
 *
 * @internal
 */
export type ForScope<Scope extends IdScope.IdScope> = [Scope] extends [
  IdScope.App,
]
  ? StorageActionWriter
  : { readonly "~ScopedStorageActionWriter": Types.Invariant<Scope> };

const make = (storageActionWriter: ConvexStorageActionWriter) => ({
  /**
   * Reads a stored blob's contents in a mutation, action, or HTTP handler.
   *
   * @category Reading
   *
   * @param storageId - ID of the blob to read.
   *
   * @returns An Effect producing a `Blob`, or failing with
   *   {@link BlobNotFoundError} if none exists. A Convex rejection is a
   *   defect.
   */
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () =>
              Effect.fail(BlobNotFoundError.make({ id: storageId })),
            onSome: Effect.succeed,
          }),
        ),
      ),
    ),
  /**
   * Stores a blob in a mutation, action, or HTTP handler and returns its
   * storage ID.
   *
   * @category Writing
   *
   * @param blob - Contents and media type to store.
   * @param options - Optional `sha256` checksum for Convex to verify.
   *
   * @returns An Effect producing an ID in `_storage`. A Convex rejection is a
   *   defect.
   */
  store: (blob: Blob, options?: { sha256?: string }) =>
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

/**
 * Compatibility tag for reading and storing blob contents. Despite the name,
 * Confect supplies the service in mutations as well as actions and HTTP
 * handlers. Use the generated `Storage` tag in new code.
 *
 * @category Tags
 */
export class StorageActionWriter extends Context.Service<
  StorageActionWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageActionWriter") {
  /**
   * Constructs a scoped tag for codegen. Yield the generated
   * `StorageActionWriter` tag from `confect/_generated/services` instead.
   *
   * @internal
   */
  static readonly forScope = <
    Scope extends IdScope.IdScope = IdScope.App,
  >(): Context.Service<ForScope<Scope>, Service<Scope>> =>
    Context.Service("@confect/server/StorageActionWriter");

  /**
   * @internal
   */
  static readonly layer = <Scope extends IdScope.IdScope = IdScope.App>(
    storageActionWriter: ConvexStorageActionWriter,
    _scope?: Scope,
  ) =>
    Layer.succeed(
      this.forScope<Scope>(),
      make(storageActionWriter) as unknown as Service<Scope>,
    );
}
