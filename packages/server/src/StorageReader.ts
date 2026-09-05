import type * as IdScope from "@confect/core/IdScope";
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

export type Service<Scope extends IdScope.IdScope = IdScope.App> = {
  getUrl: (
    id: ScopedId.GenericId<"_storage", Scope>,
  ) => ReturnType<ReturnType<typeof make>["getUrl"]>;
};
export type ForScope<Scope extends IdScope.IdScope> = Scope extends IdScope.App
  ? StorageReader
  : { readonly "~ScopedStorageReader": Scope };

const make = (storageReader: ConvexStorageReader) => ({
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.andThen(
        flow(
          Option.fromNullishOr,
          Option.match({
            onNone: () => Effect.fail(new BlobNotFoundError({ id: storageId })),
            onSome: (doc) =>
              pipe(
                doc,
                Schema.decodeEffect(Schema.URLFromString),
                Effect.orDie,
              ),
          }),
        ),
      ),
    ),
});

export class StorageReader extends Context.Service<
  StorageReader,
  ReturnType<typeof make>
>()("@confect/server/StorageReader") {
  static readonly forScope = <
    Scope extends IdScope.IdScope = IdScope.App,
  >(): Context.Service<ForScope<Scope>, Service<Scope>> =>
    Context.Service("@confect/server/StorageReader");

  static readonly layer = <Scope extends IdScope.IdScope = IdScope.App>(
    storageReader: ConvexStorageReader,
    _scope?: Scope,
  ) =>
    Layer.succeed(
      this.forScope<Scope>(),
      make(storageReader) as unknown as Service<Scope>,
    );
}
