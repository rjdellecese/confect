import { Effect, Layer, Schema } from "effect";
import { StorageActionWriter as StorageActionWriter$1, StorageReader as StorageReader$1, StorageWriter as StorageWriter$1 } from "convex/server";
import { GenericId } from "convex/values";
import * as effect_Context0 from "effect/Context";
import * as effect_Cause0 from "effect/Cause";

//#region src/server/Storage.d.ts
declare namespace Storage_d_exports {
  export { FileNotFoundError, StorageActionWriter, StorageReader, StorageWriter };
}
declare const StorageReader_base: effect_Context0.TagClass<StorageReader, "@rjdellecese/confect/server/Storage/StorageReader", {
  getUrl: (storageId: GenericId<"_storage">) => Effect.Effect<URL, FileNotFoundError, never>;
}> & Effect.Tag.Proxy<StorageReader, {
  getUrl: (storageId: GenericId<"_storage">) => Effect.Effect<URL, FileNotFoundError, never>;
}> & {
  use: <X>(body: (_: {
    getUrl: (storageId: GenericId<"_storage">) => Effect.Effect<URL, FileNotFoundError, never>;
  }) => X) => [X] extends [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, R | StorageReader> : [X] extends [PromiseLike<infer A_1>] ? Effect.Effect<A_1, effect_Cause0.UnknownException, StorageReader> : Effect.Effect<X, never, StorageReader>;
};
declare class StorageReader extends StorageReader_base {
  static readonly layer: (storageReader: StorageReader$1) => Layer.Layer<StorageReader, never, never>;
}
declare const StorageWriter_base: effect_Context0.TagClass<StorageWriter, "@rjdellecese/confect/server/Storage/StorageWriter", {
  generateUploadUrl: () => Effect.Effect<URL, never, never>;
  delete: (storageId: GenericId<"_storage">) => Effect.Effect<void, FileNotFoundError, never>;
}> & Effect.Tag.Proxy<StorageWriter, {
  generateUploadUrl: () => Effect.Effect<URL, never, never>;
  delete: (storageId: GenericId<"_storage">) => Effect.Effect<void, FileNotFoundError, never>;
}> & {
  use: <X>(body: (_: {
    generateUploadUrl: () => Effect.Effect<URL, never, never>;
    delete: (storageId: GenericId<"_storage">) => Effect.Effect<void, FileNotFoundError, never>;
  }) => X) => [X] extends [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, R | StorageWriter> : [X] extends [PromiseLike<infer A_1>] ? Effect.Effect<A_1, effect_Cause0.UnknownException, StorageWriter> : Effect.Effect<X, never, StorageWriter>;
};
declare class StorageWriter extends StorageWriter_base {
  static readonly layer: (storageWriter: StorageWriter$1) => Layer.Layer<StorageWriter, never, never>;
}
declare const StorageActionWriter_base: effect_Context0.TagClass<StorageActionWriter, "@rjdellecese/confect/server/Storage/StorageActionWriter", {
  get: (storageId: GenericId<"_storage">) => Effect.Effect<Blob, FileNotFoundError, never>;
  store: (blob: Blob, options?: {
    sha256?: string;
  }) => Effect.Effect<GenericId<"_storage">, never, never>;
}> & Effect.Tag.Proxy<StorageActionWriter, {
  get: (storageId: GenericId<"_storage">) => Effect.Effect<Blob, FileNotFoundError, never>;
  store: (blob: Blob, options?: {
    sha256?: string;
  }) => Effect.Effect<GenericId<"_storage">, never, never>;
}> & {
  use: <X>(body: (_: {
    get: (storageId: GenericId<"_storage">) => Effect.Effect<Blob, FileNotFoundError, never>;
    store: (blob: Blob, options?: {
      sha256?: string;
    }) => Effect.Effect<GenericId<"_storage">, never, never>;
  }) => X) => [X] extends [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, R | StorageActionWriter> : [X] extends [PromiseLike<infer A_1>] ? Effect.Effect<A_1, effect_Cause0.UnknownException, StorageActionWriter> : Effect.Effect<X, never, StorageActionWriter>;
};
declare class StorageActionWriter extends StorageActionWriter_base {
  static readonly layer: (storageActionWriter: StorageActionWriter$1) => Layer.Layer<StorageActionWriter, never, never>;
}
declare const FileNotFoundError_base: Schema.TaggedErrorClass<FileNotFoundError, "FileNotFoundError", {
  readonly _tag: Schema.tag<"FileNotFoundError">;
} & {
  id: typeof Schema.String;
}>;
declare class FileNotFoundError extends FileNotFoundError_base {
  get message(): string;
}
//#endregion
export { FileNotFoundError, StorageActionWriter, StorageReader, StorageWriter, Storage_d_exports };
//# sourceMappingURL=Storage.d.ts.map