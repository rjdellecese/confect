import type { GenericId } from "@confect/core/GenericId";
import type * as IdScope from "@confect/core/IdScope";
import type * as Types from "effect/Types";
import type { StorageReader as ConvexStorageReader } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { StorageActionWriter } from "./StorageActionWriter";
import { StorageReader } from "./StorageReader";
import { StorageWriter } from "./StorageWriter";

const make = <Scope extends IdScope.IdScope = IdScope.App>() =>
  Effect.gen(function* () {
    const reader = yield* StorageReader.forScope<Scope>();
    return {
      /**
       * Reads the download URL for a stored blob in any function context.
       *
       * @category Reading
       *
       * @param id - ID in this database's `_storage` table.
       *
       * @returns An Effect producing a `URL`, or failing with
       *   `BlobNotFoundError` if no URL exists. An invalid URL or unexpected
       *   Convex failure is a defect.
       */
      getUrl: reader.getUrl,
      /**
       * Effect that creates a temporary upload URL in a mutation, action, or
       * HTTP handler. Yield `storage.generateUploadUrl` without calling it. An
       * invalid URL or Convex failure is a defect.
       *
       * @category Writing
       */
      generateUploadUrl: Effect.flatMap(
        StorageWriter.forScope<Scope>(),
        (writer) => writer.generateUploadUrl,
      ),
      /**
       * Deletes a stored blob in a mutation, action, or HTTP handler.
       *
       * @category Writing
       *
       * @param storageId - ID of the blob to delete.
       *
       * @returns An Effect that completes without a value. Any Convex rejection
       *   becomes `BlobNotFoundError`.
       */
      delete: (storageId: GenericId<"_storage", Scope>) =>
        Effect.flatMap(StorageWriter.forScope<Scope>(), (writer) =>
          writer.delete(storageId),
        ),
      /**
       * Reads the contents of a stored blob in a mutation, action, or HTTP
       * handler.
       *
       * @category Reading
       *
       * @param storageId - ID of the blob to read.
       *
       * @returns An Effect producing a `Blob`, or failing with
       *   `BlobNotFoundError` if none exists. A Convex rejection is a defect.
       */
      get: (storageId: GenericId<"_storage", Scope>) =>
        Effect.flatMap(StorageActionWriter.forScope<Scope>(), (writer) =>
          writer.get(storageId),
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
       * @returns An Effect producing an ID in this database's `_storage` table.
       *   A Convex rejection is a defect.
       */
      store: (blob: Blob, options?: { sha256?: string }) =>
        Effect.flatMap(StorageActionWriter.forScope<Scope>(), (writer) =>
          writer.store(blob, options),
        ),
    };
  });

/**
 * File operations on the generated `Storage` tag. Queries can read URLs;
 * mutations, actions, and HTTP handlers can also write and read blob contents.
 *
 * @remarks
 *   Codegen support: this type describes the generated service. Yield `Storage`
 *   from `confect/_generated/services` to use its operations.
 *
 * @category Services
 */
export type Service<Scope extends IdScope.IdScope = IdScope.App> =
  Effect.Success<ReturnType<typeof make<Scope>>>;

/**
 * Types the generated `Storage` requirement for its database scope. Use the
 * identically named type from `confect/_generated/services`.
 *
 * @internal
 */
export type ForScope<Scope extends IdScope.IdScope> = [Scope] extends [
  IdScope.App,
]
  ? Storage
  : { readonly "~ScopedStorage": Types.Invariant<Scope> };

/**
 * Tag for working with Convex file storage. Yield the generated `Storage` tag
 * in any function context. Its IDs belong to the current application or
 * component scope.
 *
 * **Gotchas**
 *
 * Queries can read download URLs but cannot read blob contents. Creating upload
 * URLs, deleting blobs, and reading or storing blob contents require a
 * mutation, action, or HTTP handler.
 *
 * @category Tags
 */
export class Storage extends Context.Service<Storage, Service>()(
  "@confect/server/Storage",
) {
  /**
   * Constructs a scoped tag for codegen. Yield the generated `Storage` tag from
   * `confect/_generated/services` instead.
   *
   * @internal
   */
  static readonly forScope = <
    Scope extends IdScope.IdScope = IdScope.App,
  >(): Context.Service<ForScope<Scope>, Service<Scope>> =>
    Context.Service("@confect/server/Storage");
}

/**
 * @internal
 */
export const layer = <Scope extends IdScope.IdScope = IdScope.App>(
  storageReader: ConvexStorageReader,
  scope?: Scope,
) =>
  Layer.effect(Storage.forScope<Scope>(), make<Scope>()).pipe(
    Layer.provideMerge(StorageReader.layer<Scope>(storageReader, scope)),
  );
