import type { StorageActionWriter as ConvexStorageActionWriter } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { BlobNotFoundError } from "./BlobNotFoundError";
import type * as ScopedId from "@confect/core/GenericId";

export type Service<Scope extends string = ""> = {
  get: (
    id: ScopedId.GenericId<"_storage", Scope>,
  ) => ReturnType<ReturnType<typeof make>["get"]>;
  store: (
    blob: Blob,
    options?: { sha256?: string },
  ) => Effect.Effect<ScopedId.GenericId<"_storage", Scope>>;
};
export type ForScope<Scope extends string> = Scope extends ""
  ? StorageActionWriter
  : { readonly "~ScopedStorageActionWriter": Scope };

const make = (storageActionWriter: ConvexStorageActionWriter) => ({
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () => Effect.fail(new BlobNotFoundError({ id: storageId })),
            onSome: Effect.succeed,
          }),
        ),
      ),
    ),
  store: (blob: Blob, options?: { sha256?: string }) =>
    Effect.promise(() => storageActionWriter.store(blob, options)),
});

export class StorageActionWriter extends Context.Service<
  StorageActionWriter,
  ReturnType<typeof make>
>()("@confect/server/StorageActionWriter") {
  static readonly forScope = <Scope extends string = "">(): Context.Service<
    ForScope<Scope>,
    Service<Scope>
  > => Context.Service("@confect/server/StorageActionWriter");

  static readonly layer = <Scope extends string = "">(
    storageActionWriter: ConvexStorageActionWriter,
    _scope?: Scope,
  ) =>
    Layer.succeed(
      this.forScope<Scope>(),
      make(storageActionWriter) as unknown as Service<Scope>,
    );
}
