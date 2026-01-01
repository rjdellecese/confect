const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/Storage.ts
var Storage_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	FileNotFoundError: () => FileNotFoundError,
	StorageActionWriter: () => StorageActionWriter,
	StorageReader: () => StorageReader,
	StorageWriter: () => StorageWriter
});
const makeStorageReader = (storageReader) => ({ getUrl: (storageId) => effect.Effect.promise(() => storageReader.getUrl(storageId)).pipe(effect.Effect.andThen((0, effect.flow)(effect.Option.fromNullable, effect.Option.match({
	onNone: () => effect.Effect.fail(new FileNotFoundError({ id: storageId })),
	onSome: (doc) => (0, effect.pipe)(doc, effect.Schema.decode(effect.Schema.URL), effect.Effect.orDie)
})))) });
const makeStorageWriter = (storageWriter) => ({
	generateUploadUrl: () => effect.Effect.promise(() => storageWriter.generateUploadUrl()).pipe(effect.Effect.andThen((url) => (0, effect.pipe)(url, effect.Schema.decode(effect.Schema.URL), effect.Effect.orDie))),
	delete: (storageId) => effect.Effect.tryPromise({
		try: () => storageWriter.delete(storageId),
		catch: () => new FileNotFoundError({ id: storageId })
	})
});
const makeStorageActionWriter = (storageActionWriter) => ({
	get: (storageId) => effect.Effect.promise(() => storageActionWriter.get(storageId)).pipe(effect.Effect.andThen((0, effect.flow)(effect.Option.fromNullable, effect.Option.match({
		onNone: () => effect.Effect.fail(new FileNotFoundError({ id: storageId })),
		onSome: effect.Effect.succeed
	})))),
	store: (blob, options) => effect.Effect.promise(() => storageActionWriter.store(blob, options))
});
var StorageReader = class extends effect.Effect.Tag("@rjdellecese/confect/server/Storage/StorageReader")() {
	static layer = (storageReader) => effect.Layer.succeed(this, makeStorageReader(storageReader));
};
var StorageWriter = class extends effect.Effect.Tag("@rjdellecese/confect/server/Storage/StorageWriter")() {
	static layer = (storageWriter) => effect.Layer.succeed(this, makeStorageWriter(storageWriter));
};
var StorageActionWriter = class extends effect.Effect.Tag("@rjdellecese/confect/server/Storage/StorageActionWriter")() {
	static layer = (storageActionWriter) => effect.Layer.succeed(this, makeStorageActionWriter(storageActionWriter));
};
var FileNotFoundError = class extends effect.Schema.TaggedError("FileNotFoundError")("FileNotFoundError", { id: effect.Schema.String }) {
	get message() {
		return `File with ID '${this.id}' not found`;
	}
};

//#endregion
exports.FileNotFoundError = FileNotFoundError;
exports.StorageActionWriter = StorageActionWriter;
exports.StorageReader = StorageReader;
exports.StorageWriter = StorageWriter;
Object.defineProperty(exports, 'Storage_exports', {
  enumerable: true,
  get: function () {
    return Storage_exports;
  }
});
//# sourceMappingURL=Storage.cjs.map