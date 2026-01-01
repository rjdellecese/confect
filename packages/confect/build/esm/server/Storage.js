import { __export } from "../_virtual/rolldown_runtime.js";
import { Effect, Layer, Option, Schema, flow, pipe } from "effect";

//#region src/server/Storage.ts
var Storage_exports = /* @__PURE__ */ __export({
	FileNotFoundError: () => FileNotFoundError,
	StorageActionWriter: () => StorageActionWriter,
	StorageReader: () => StorageReader,
	StorageWriter: () => StorageWriter
});
const makeStorageReader = (storageReader) => ({ getUrl: (storageId) => Effect.promise(() => storageReader.getUrl(storageId)).pipe(Effect.andThen(flow(Option.fromNullable, Option.match({
	onNone: () => Effect.fail(new FileNotFoundError({ id: storageId })),
	onSome: (doc) => pipe(doc, Schema.decode(Schema.URL), Effect.orDie)
})))) });
const makeStorageWriter = (storageWriter) => ({
	generateUploadUrl: () => Effect.promise(() => storageWriter.generateUploadUrl()).pipe(Effect.andThen((url) => pipe(url, Schema.decode(Schema.URL), Effect.orDie))),
	delete: (storageId) => Effect.tryPromise({
		try: () => storageWriter.delete(storageId),
		catch: () => new FileNotFoundError({ id: storageId })
	})
});
const makeStorageActionWriter = (storageActionWriter) => ({
	get: (storageId) => Effect.promise(() => storageActionWriter.get(storageId)).pipe(Effect.andThen(flow(Option.fromNullable, Option.match({
		onNone: () => Effect.fail(new FileNotFoundError({ id: storageId })),
		onSome: Effect.succeed
	})))),
	store: (blob, options) => Effect.promise(() => storageActionWriter.store(blob, options))
});
var StorageReader = class extends Effect.Tag("@rjdellecese/confect/server/Storage/StorageReader")() {
	static layer = (storageReader) => Layer.succeed(this, makeStorageReader(storageReader));
};
var StorageWriter = class extends Effect.Tag("@rjdellecese/confect/server/Storage/StorageWriter")() {
	static layer = (storageWriter) => Layer.succeed(this, makeStorageWriter(storageWriter));
};
var StorageActionWriter = class extends Effect.Tag("@rjdellecese/confect/server/Storage/StorageActionWriter")() {
	static layer = (storageActionWriter) => Layer.succeed(this, makeStorageActionWriter(storageActionWriter));
};
var FileNotFoundError = class extends Schema.TaggedError("FileNotFoundError")("FileNotFoundError", { id: Schema.String }) {
	get message() {
		return `File with ID '${this.id}' not found`;
	}
};

//#endregion
export { FileNotFoundError, StorageActionWriter, StorageReader, StorageWriter, Storage_exports };
//# sourceMappingURL=Storage.js.map