import type * as IdScope from "@confect/core/IdScope";
import type * as Types from "effect/Types";
import type { StorageReader as ConvexStorageReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { flow, pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";
import type * as ScopedId from "@confect/core/GenericId";

/**
 * Service for looking up download URLs in any function context.
 *
 * @remarks
 *   Codegen support: this type describes the generated service. Yield
 *   `StorageReader` from `confect/_generated/services` to use its operations.
 *
 * @category Services
 */
export type Service<Scope extends IdScope.IdScope = IdScope.App> = {
  /**
   * Reads the download URL for a storage ID in this scope without fetching the
   * blob. A missing URL fails with {@link BlobNotFoundError}; an invalid URL or
   * Convex rejection is a defect.
   *
   * @category Reading
   */
  getUrl: (
    id: ScopedId.GenericId<"_storage", Scope>,
  ) => ReturnType<ReturnType<typeof make>["getUrl"]>;
};
/**
 * Types the generated `StorageReader` requirement for its database scope. Use
 * the identically named type from `confect/_generated/services`.
 *
 * @internal
 */
export type ForScope<Scope extends IdScope.IdScope> = [Scope] extends [
  IdScope.App,
]
  ? StorageReader
  : { readonly "~ScopedStorageReader": Types.Invariant<Scope> };

const make = (storageReader: ConvexStorageReader) => ({
  /**
   * Reads a stored blob's download URL without fetching its contents.
   *
   * @category Reading
   *
   * @param storageId - ID in the `_storage` table.
   *
   * @returns An Effect producing a `URL`, or failing with
   *   {@link BlobNotFoundError} if no URL exists. An invalid URL or Convex
   *   rejection is a defect.
   */
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () =>
              Effect.fail(BlobNotFoundError.make({ id: storageId })),
            onSome: (doc) =>
              pipe(
                doc,
                Schema.decodeEffect(Schema.URLFromString),
                Effect.catchTag("SchemaError", Effect.die),
              ),
          }),
        ),
      ),
    ),
});

/**
 * Compatibility tag for reading blob download URLs in any function context. Use
 * the generated `Storage` tag in new code.
 *
 * @category Tags
 */
export class StorageReader extends Context.Service<
  StorageReader,
  ReturnType<typeof make>
>()("@confect/server/StorageReader") {
  /**
   * Constructs a scoped tag for codegen. Yield the generated `StorageReader`
   * tag from `confect/_generated/services` instead.
   *
   * @internal
   */
  static readonly forScope = <
    Scope extends IdScope.IdScope = IdScope.App,
  >(): Context.Service<ForScope<Scope>, Service<Scope>> =>
    Context.Service("@confect/server/StorageReader");

  /**
   * @internal
   */
  static readonly layer = <Scope extends IdScope.IdScope = IdScope.App>(
    storageReader: ConvexStorageReader,
    _scope?: Scope,
  ) =>
    Layer.succeed(
      this.forScope<Scope>(),
      make(storageReader) as unknown as Service<Scope>,
    );
}
