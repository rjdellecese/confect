import type { StorageWriter as ConvexStorageWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { BlobNotFoundError } from "./BlobNotFoundError";
import type * as ScopedId from "@confect/core/GenericId";

export type Service<Scope extends string = ""> = {
  generateUploadUrl: ReturnType<typeof make>["generateUploadUrl"];
  delete: (
    id: ScopedId.GenericId<"_storage", Scope>,
  ) => ReturnType<ReturnType<typeof make>["delete"]>;
};
export type ForScope<Scope extends string> = Scope extends ""
  ? StorageWriter
  : { readonly "~ScopedStorageWriter": Scope };

const make = (storageWriter: ConvexStorageWriter) => ({
  generateUploadUrl: Effect.promise(() =>
    storageWriter.generateUploadUrl(),
  ).pipe(
    Effect.andThen((url) =>
      pipe(url, Schema.decodeEffect(Schema.URLFromString), Effect.orDie),
    ),
  ),
  delete: (storageId: GenericId<"_storage">) =>
    Effect.tryPromise({
      try: () => storageWriter.delete(storageId),
      catch: () => new BlobNotFoundError({ id: storageId }),
    }),
});

export class StorageWriter extends Context.Service<
  StorageWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageWriter") {
  static readonly forScope = <Scope extends string = "">(): Context.Service<
    ForScope<Scope>,
    Service<Scope>
  > => Context.Service("@confect/server/StorageWriter");

  static readonly layer = <Scope extends string = "">(
    storageWriter: ConvexStorageWriter,
    _scope?: Scope,
  ) =>
    Layer.succeed(
      this.forScope<Scope>(),
      make(storageWriter) as unknown as Service<Scope>,
    );
}
