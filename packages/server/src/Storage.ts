import type { GenericId } from "@confect/core/GenericId";
import type * as IdScope from "@confect/core/IdScope";
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
      getUrl: reader.getUrl,
      generateUploadUrl: Effect.flatMap(
        StorageWriter.forScope<Scope>(),
        (writer) => writer.generateUploadUrl,
      ),
      delete: (storageId: GenericId<"_storage", Scope>) =>
        Effect.flatMap(StorageWriter.forScope<Scope>(), (writer) =>
          writer.delete(storageId),
        ),
      get: (storageId: GenericId<"_storage", Scope>) =>
        Effect.flatMap(StorageActionWriter.forScope<Scope>(), (writer) =>
          writer.get(storageId),
        ),
      store: (blob: Blob, options?: { sha256?: string }) =>
        Effect.flatMap(StorageActionWriter.forScope<Scope>(), (writer) =>
          writer.store(blob, options),
        ),
    };
  });

export type Service<Scope extends IdScope.IdScope = IdScope.App> =
  Effect.Success<ReturnType<typeof make<Scope>>>;

export type ForScope<Scope extends IdScope.IdScope> = Scope extends IdScope.App
  ? Storage
  : { readonly "~ScopedStorage": Scope };

export class Storage extends Context.Service<Storage, Service>()(
  "@confect/server/Storage",
) {
  static readonly forScope = <
    Scope extends IdScope.IdScope = IdScope.App,
  >(): Context.Service<ForScope<Scope>, Service<Scope>> =>
    Context.Service("@confect/server/Storage");
}

export const layer = <Scope extends IdScope.IdScope = IdScope.App>(
  storageReader: ConvexStorageReader,
  scope?: Scope,
) =>
  Layer.effect(Storage.forScope<Scope>(), make<Scope>()).pipe(
    Layer.provideMerge(StorageReader.layer<Scope>(storageReader, scope)),
  );
